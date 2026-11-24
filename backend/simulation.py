# ============================================================
# simulation.py
# Simulation du fonctionnement des machines à partir des données NASA
#
# Les "machines" de l'application sont les 20 moteurs de VALIDATION
# (jamais utilisés pour entraîner les modèles). La simulation rejoue
# leurs vraies mesures, cycle par cycle, jusqu'à la panne.
# ============================================================

import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from features import load_cmapss_file, SELECTED_SENSORS
from prediction import (preprocessing, predict_machine, predict_all_cycles,
                        readings_to_dataframe, save_prediction, get_priority,
                        get_recommendation, get_unusual_sensor_labels,
                        NOT_EVALUATED_STATE, RECOMMENDATION_NOT_EVALUATED)
from database import (machines_collection, sensor_readings_collection,
                      predictions_collection, alerts_collection)

DATA_FOLDER = Path(__file__).resolve().parent.parent / "data"

# ------------------------------------------------------------
# Chargement des données NASA des moteurs de validation
# ------------------------------------------------------------
nasa_data = load_cmapss_file(DATA_FOLDER / "train_FD001.txt")
machine_engine_ids = preprocessing["validation_engine_ids"]


def make_machine_id(engine_id):
    """Identifiant lisible d'une machine, ex : MOT-002."""
    return "MOT-" + str(engine_id).zfill(3)


def get_engine_readings(machine_id):
    """Retourne la liste des mesures NASA (dictionnaires) d'une machine, triées par cycle."""
    engine_id = int(machine_id.replace("MOT-", ""))
    engine_data = nasa_data[nasa_data["unit_id"] == engine_id].sort_values("cycle")

    readings = []
    for index in range(len(engine_data)):
        row = engine_data.iloc[index]
        reading = {"cycle": int(row["cycle"])}
        for sensor in SELECTED_SENSORS:
            reading[sensor] = float(row[sensor])
        readings.append(reading)
    return readings


def extract_sensor_values(reading):
    """Garde uniquement les valeurs des capteurs d'une mesure (sans le cycle)."""
    sensor_values = {}
    for sensor in SELECTED_SENSORS:
        sensor_values[sensor] = reading[sensor]
    return sensor_values


def process_cycle(machine_id, readings_until_now, measured_at=None):
    """Prédit l'état au dernier cycle puis enregistre tout dans MongoDB."""
    history = readings_to_dataframe(readings_until_now, machine_id)
    result = predict_machine(history)
    last_reading = readings_until_now[-1]
    alert = save_prediction(machine_id, extract_sensor_values(last_reading), result, measured_at)
    return result, alert


# ------------------------------------------------------------
# Initialisation des machines (données de démonstration)
# ------------------------------------------------------------
def initialize_machines():
    """Crée les machines dans MongoDB si la collection est vide.

    Pour obtenir un parc réaliste, chaque moteur a déjà parcouru une partie
    de sa vie réelle (entre 35 % et 95 %). Ces cycles passés sont rejoués
    avec les modèles IA pour remplir l'historique.
    """
    if machines_collection.count_documents({}) > 0:
        complete_old_machines()
        return

    print("Initialisation des machines de démonstration...")
    number_of_machines = len(machine_engine_ids)

    for position in range(number_of_machines):
        engine_id = machine_engine_ids[position]
        machine_id = make_machine_id(engine_id)
        readings = get_engine_readings(machine_id)

        # Tant qu'aucune estimation n'est faite, la machine est "Non évaluée"
        # (elle ne doit jamais être présentée comme saine par défaut)
        machines_collection.insert_one({
            "machine_id": machine_id,
            "name": "Moteur turbofan n°" + str(engine_id),
            "total_cycles_available": len(readings),
        })
        mark_machine_not_evaluated(machine_id)

        # Part de la vie déjà parcourue : de 35 % à 95 % selon la machine
        life_fraction = 0.35 + 0.60 * position / (number_of_machines - 1)
        start_cycle = int(len(readings) * life_fraction)

        # Prédictions de tous les cycles passés en une seule fois
        # (possible car les variables n'utilisent que le passé)
        past_readings = readings[:start_cycle]
        history = readings_to_dataframe(past_readings, machine_id)
        results = predict_all_cycles(history)

        # Enregistrement cycle par cycle (1 cycle = 1 heure de fonctionnement fictive)
        for cycle_index in range(start_cycle):
            hours_ago = start_cycle - cycle_index
            measured_at = datetime.now() - timedelta(hours=hours_ago)
            sensor_values = extract_sensor_values(past_readings[cycle_index])
            save_prediction(machine_id, sensor_values, results[cycle_index], measured_at)

    print("Machines initialisées :", number_of_machines)


def complete_old_machines():
    """Complète les machines créées par une ancienne version de l'application.

    Ajoute seulement les champs manquants (priorité, recommandation...) à partir
    des résultats déjà enregistrés. Aucune donnée n'est supprimée.
    """
    for machine in machines_collection.find({"priority": {"$exists": False}}):
        if machine.get("health_score") is None:
            mark_machine_not_evaluated(machine["machine_id"])
            continue

        rul = machine.get("current_rul") or 0
        is_anomaly = bool(machine.get("is_anomaly", False))
        machines_collection.update_one(
            {"machine_id": machine["machine_id"]},
            {"$set": {
                "priority": get_priority(machine["state"]),
                "recommendation": get_recommendation(machine["state"], rul, is_anomaly),
                "is_anomaly": is_anomaly,
                "unusual_sensors": machine.get("unusual_sensors", []),
            }},
        )
        print("Machine complétée :", machine["machine_id"])


def mark_machine_not_evaluated(machine_id):
    """Remet une machine à l'état "Non évaluée" (aucune estimation disponible)."""
    machines_collection.update_one(
        {"machine_id": machine_id},
        {"$set": {
            "state": NOT_EVALUATED_STATE,
            "priority": NOT_EVALUATED_STATE,
            "recommendation": RECOMMENDATION_NOT_EVALUATED,
            "current_rul": None,
            "health_score": None,
            "anomaly_score": None,
            "is_anomaly": False,
            "unusual_sensors": [],
            "current_cycle": 0,
            "last_update": datetime.now(),
        }},
    )


def reset_all_data():
    """Supprime toutes les données puis recrée les machines de démonstration."""
    stop_simulation()
    machines_collection.delete_many({})
    sensor_readings_collection.delete_many({})
    predictions_collection.delete_many({})
    alerts_collection.delete_many({})
    initialize_machines()


# ------------------------------------------------------------
# Simulation en temps réel (thread en arrière-plan)
# ------------------------------------------------------------
# État de la simulation partagé avec l'API
simulation_state = {
    "status": "stopped",      # stopped | running | paused | finished
    "machine_id": None,
    "current_cycle": 0,
    "max_cycle": 0,
    "speed": 2,
    "run_number": 0,          # change à chaque démarrage pour arrêter l'ancien thread
    "last_result": None,
    "last_sensors": None,
    "history": [],            # résultats de chaque cycle simulé (pour les graphiques)
    "alerts": [],             # alertes générées pendant la simulation
}


def simulation_loop(run_number, readings):
    """Boucle exécutée dans un thread : un cycle est traité à chaque tour."""
    cycle_index = 0

    while cycle_index < len(readings):
        # Si une autre simulation a été lancée ou si l'on a arrêté : on sort
        if simulation_state["run_number"] != run_number:
            return
        if simulation_state["status"] == "stopped":
            return

        # En pause : on attend sans avancer
        if simulation_state["status"] == "paused":
            time.sleep(0.2)
            continue

        # Traitement du cycle suivant
        machine_id = simulation_state["machine_id"]
        result, alert = process_cycle(machine_id, readings[:cycle_index + 1])

        # Informations d'aide à la décision ajoutées au résultat
        result["priority"] = get_priority(result["state"])
        result["recommendation"] = get_recommendation(result["state"], result["predicted_rul"],
                                                      result["is_anomaly"])
        result["unusual_sensors"] = []
        if result["is_anomaly"]:
            result["unusual_sensors"] = get_unusual_sensor_labels(result)

        simulation_state["current_cycle"] = result["cycle"]
        simulation_state["last_result"] = result
        simulation_state["last_sensors"] = extract_sensor_values(readings[cycle_index])
        simulation_state["history"].append({
            "cycle": result["cycle"],
            "predicted_rul": result["predicted_rul"],
            "health_score": result["health_score"],
            "anomaly_score": result["anomaly_score"],
            "is_anomaly": result["is_anomaly"],
            "state": result["state"],
            "sensors": extract_sensor_values(readings[cycle_index]),
        })
        if alert is not None:
            simulation_state["alerts"].append(alert)

        cycle_index = cycle_index + 1

        # Attente selon la vitesse choisie (cycles par seconde)
        time.sleep(1 / simulation_state["speed"])

    # Fin des données : le moteur est arrivé au dernier cycle avant la panne
    if simulation_state["run_number"] == run_number:
        simulation_state["status"] = "finished"


def start_simulation(machine_id, speed):
    """Démarre la simulation d'une machine depuis son premier cycle."""
    readings = get_engine_readings(machine_id)

    # La machine repart de zéro : on efface ses anciennes mesures et prédictions
    sensor_readings_collection.delete_many({"machine_id": machine_id})
    predictions_collection.delete_many({"machine_id": machine_id})
    mark_machine_not_evaluated(machine_id)

    simulation_state["run_number"] = simulation_state["run_number"] + 1
    simulation_state["status"] = "running"
    simulation_state["machine_id"] = machine_id
    simulation_state["current_cycle"] = 0
    simulation_state["max_cycle"] = len(readings)
    simulation_state["speed"] = speed
    simulation_state["last_result"] = None
    simulation_state["last_sensors"] = None
    simulation_state["history"] = []
    simulation_state["alerts"] = []

    # Lancement du thread (daemon : il s'arrête avec le serveur)
    thread = threading.Thread(target=simulation_loop,
                              args=(simulation_state["run_number"], readings),
                              daemon=True)
    thread.start()


def change_speed(speed):
    """Modifie la vitesse pendant la simulation (pris en compte au cycle suivant)."""
    simulation_state["speed"] = speed


def pause_simulation():
    if simulation_state["status"] == "running":
        simulation_state["status"] = "paused"


def resume_simulation():
    if simulation_state["status"] == "paused":
        simulation_state["status"] = "running"


def stop_simulation():
    if simulation_state["status"] in ["running", "paused"]:
        simulation_state["status"] = "stopped"


def get_simulation_status():
    """Retourne une copie de l'état de la simulation (sans le numéro interne)."""
    status = dict(simulation_state)
    del status["run_number"]
    return status
