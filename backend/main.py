# ============================================================
# main.py
# API REST FastAPI de Smart Maintenance AI
#
# Lancement (depuis le dossier backend, environnement virtuel activé) :
#     uvicorn main:app --reload
# Documentation Swagger : http://localhost:8000/docs
# ============================================================

from contextlib import asynccontextmanager
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import PredictRequest, SimulationStartRequest, SimulationSpeedRequest, AlertStatusUpdate
from database import (check_connection, create_indexes, clean_document, clean_documents,
                      machines_collection, sensor_readings_collection,
                      predictions_collection, alerts_collection)
from prediction import (model_metrics, predict_machine, readings_to_dataframe,
                        save_prediction, NOT_EVALUATED_STATE)
from features import SENSOR_INFO
import simulation


# ------------------------------------------------------------
# Démarrage de l'application
# ------------------------------------------------------------
@asynccontextmanager
async def lifespan(app):
    # Code exécuté au démarrage du serveur
    check_connection()
    create_indexes()
    simulation.initialize_machines()
    yield
    # Code exécuté à l'arrêt du serveur
    simulation.stop_simulation()


app = FastAPI(
    title="Smart Maintenance AI",
    description="API de maintenance prédictive des moteurs (NASA C-MAPSS FD001)",
    version="1.0",
    lifespan=lifespan,
)

# Autorise l'application Angular (port 4200) à appeler l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "API Smart Maintenance AI en fonctionnement", "documentation": "/docs"}


# ------------------------------------------------------------
# Machines
# ------------------------------------------------------------
@app.get("/machines")
def get_machines():
    """Liste de toutes les machines."""
    machines = machines_collection.find().sort("machine_id", 1)
    return clean_documents(machines)


@app.get("/machines/{machine_id}")
def get_machine_details(machine_id: str):
    """Détails d'une machine : informations, mesures, prédictions, anomalies et alertes."""
    machine = machines_collection.find_one({"machine_id": machine_id})
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine introuvable : " + machine_id)

    readings = sensor_readings_collection.find({"machine_id": machine_id}).sort("cycle", 1)
    predictions = clean_documents(predictions_collection.find({"machine_id": machine_id}).sort("cycle", 1))
    alerts = alerts_collection.find({"machine_id": machine_id}).sort("created_at", -1)

    # Les anomalies sont les prédictions où Isolation Forest a détecté un comportement inhabituel
    anomalies = []
    for prediction in predictions:
        if prediction["is_anomaly"]:
            anomalies.append(prediction)

    return {
        "machine": clean_document(machine),
        "sensor_readings": clean_documents(readings),
        "predictions": predictions,
        "anomalies": anomalies,
        "alerts": clean_documents(alerts),
    }


@app.post("/machines/reset")
def reset_machines():
    """Réinitialise toutes les données de démonstration (utile avant une présentation)."""
    simulation.reset_all_data()
    return {"message": "Données réinitialisées", "machines": machines_collection.count_documents({})}


# ------------------------------------------------------------
# Prédictions IA
# ------------------------------------------------------------
def convert_readings(request):
    """Convertit les mesures Pydantic en liste de dictionnaires."""
    readings = []
    for reading in request.readings:
        readings.append(reading.model_dump())
    return readings


@app.post("/predict")
def predict(request: PredictRequest):
    """Prédit le RUL, le score d'anomalie, le Health Score et l'état (dernier cycle envoyé).

    Si machine_id est fourni, le résultat est enregistré dans MongoDB.
    """
    readings = convert_readings(request)
    history = readings_to_dataframe(readings)
    result = predict_machine(history)

    alert = None
    if request.machine_id is not None:
        machine = machines_collection.find_one({"machine_id": request.machine_id})
        if machine is None:
            raise HTTPException(status_code=404, detail="Machine introuvable : " + request.machine_id)
        sensor_values = dict(readings[-1])
        del sensor_values["cycle"]
        alert = save_prediction(request.machine_id, sensor_values, result)

    result["alert_created"] = alert
    return result


@app.post("/detect-anomaly")
def detect_anomaly(request: PredictRequest):
    """Détection d'anomalie avec Isolation Forest (dernier cycle envoyé)."""
    history = readings_to_dataframe(convert_readings(request))
    result = predict_machine(history)
    return {
        "cycle": result["cycle"],
        "is_anomaly": result["is_anomaly"],
        "anomaly_score": result["anomaly_score"],
        "anomaly_raw_score": result["anomaly_raw_score"],
        "deviating_sensors": result["deviating_sensors"],
    }


@app.get("/predictions")
def get_predictions(machine_id: str = None, state: str = None, limit: int = 1000):
    """Historique des prédictions (les plus récentes en premier)."""
    query = {}
    if machine_id:
        query["machine_id"] = machine_id
    if state:
        query["state"] = state
    predictions = predictions_collection.find(query).sort("created_at", -1).limit(limit)
    return clean_documents(predictions)


# ------------------------------------------------------------
# Alertes
# ------------------------------------------------------------
@app.get("/alerts")
def get_alerts(severity: str = None, status: str = None):
    """Liste des alertes (les plus récentes en premier)."""
    query = {}
    if severity:
        query["severity"] = severity
    if status:
        query["status"] = status
    alerts = alerts_collection.find(query).sort("created_at", -1)
    return clean_documents(alerts)


@app.get("/alerts/count")
def count_active_alerts():
    """Nombre d'alertes non traitées (affiché dans l'en-tête de l'application)."""
    return {"active_alerts": alerts_collection.count_documents({"status": "active"})}


@app.patch("/alerts/{alert_id}")
def update_alert_status(alert_id: str, update: AlertStatusUpdate):
    """Change le statut d'une alerte (ex : marquer comme traitée)."""
    try:
        object_id = ObjectId(alert_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Identifiant d'alerte invalide")

    result = alerts_collection.update_one({"_id": object_id}, {"$set": {"status": update.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    return clean_document(alerts_collection.find_one({"_id": object_id}))


# ------------------------------------------------------------
# Modèles IA et tableau de bord
# ------------------------------------------------------------
@app.get("/models/metrics")
def get_model_metrics():
    """Métriques réelles des entraînements (fichier models/metrics.json).

    Destiné aux développeurs (Swagger) : ces informations techniques ne sont pas
    affichées dans l'interface utilisateur.
    """
    return model_metrics


@app.get("/dashboard")
def get_dashboard():
    """Statistiques globales du parc de machines (tableau de bord métier)."""
    machines = clean_documents(machines_collection.find().sort("machine_id", 1))

    # Comptage des états ; le score de santé moyen n'utilise que les machines évaluées
    state_counts = {"Normal": 0, "Avertissement": 0, "Critique": 0, NOT_EVALUATED_STATE: 0}
    health_total = 0
    health_count = 0
    for machine in machines:
        state_counts[machine["state"]] = state_counts[machine["state"]] + 1
        if machine["health_score"] is not None:
            health_total = health_total + machine["health_score"]
            health_count = health_count + 1

    average_health = None
    if health_count > 0:
        average_health = round(health_total / health_count, 1)

    # Machines nécessitant une intervention urgente (état critique), les plus dégradées d'abord
    urgent_machines = []
    for machine in machines:
        if machine["priority"] == "Urgente":
            urgent_machines.append(machine)
    urgent_machines.sort(key=lambda machine: machine["health_score"])

    latest_alerts = alerts_collection.find().sort("created_at", -1).limit(5)

    return {
        "total_machines": len(machines),
        "normal_machines": state_counts["Normal"],
        "warning_machines": state_counts["Avertissement"],
        "critical_machines": state_counts["Critique"],
        "not_evaluated_machines": state_counts[NOT_EVALUATED_STATE],
        "evaluated_machines": health_count,
        "active_alerts": alerts_collection.count_documents({"status": "active"}),
        "average_health_score": average_health,
        "urgent_machines": urgent_machines,
        "latest_alerts": clean_documents(latest_alerts),
        "machines": machines,
        "refreshed_at": datetime.now(),
    }


@app.get("/sensors")
def get_sensors():
    """Intitulés compréhensibles et unités des capteurs affichés dans l'interface."""
    return SENSOR_INFO


# ------------------------------------------------------------
# Simulation
# ------------------------------------------------------------
@app.post("/simulation/start")
def start_simulation(request: SimulationStartRequest):
    """Démarre la simulation d'une machine (rejoue les données NASA cycle par cycle)."""
    machine = machines_collection.find_one({"machine_id": request.machine_id})
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine introuvable : " + request.machine_id)
    simulation.start_simulation(request.machine_id, request.speed)
    return simulation.get_simulation_status()


@app.post("/simulation/speed")
def change_simulation_speed(request: SimulationSpeedRequest):
    """Modifie la vitesse de la simulation en cours."""
    simulation.change_speed(request.speed)
    return simulation.get_simulation_status()


@app.post("/simulation/pause")
def pause_simulation():
    simulation.pause_simulation()
    return simulation.get_simulation_status()


@app.post("/simulation/resume")
def resume_simulation():
    simulation.resume_simulation()
    return simulation.get_simulation_status()


@app.post("/simulation/stop")
def stop_simulation():
    simulation.stop_simulation()
    return simulation.get_simulation_status()


@app.get("/simulation/status")
def get_simulation_status():
    """État actuel de la simulation (interrogé périodiquement par Angular)."""
    return simulation.get_simulation_status()
