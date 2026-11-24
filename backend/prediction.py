# ============================================================
# prediction.py
# Chargement des modèles IA et calcul des prédictions
#   - RUL (Gradient Boosting / modèle sélectionné)
#   - score d'anomalie (Isolation Forest)
#   - Health Score et état de la machine
#   - enregistrement dans MongoDB et génération des alertes
# ============================================================

import json
from datetime import datetime
from pathlib import Path

import joblib
import pandas as pd

from features import (build_features, normalize_anomaly_score,
                      compute_health_score, get_machine_state, SENSOR_INFO)
from database import (machines_collection, sensor_readings_collection,
                      predictions_collection, alerts_collection)

# Dossier "models" du projet (un niveau au-dessus du dossier backend)
MODELS_FOLDER = Path(__file__).resolve().parent.parent / "models"

# ------------------------------------------------------------
# Chargement des modèles : fait UNE SEULE FOIS au démarrage
# ------------------------------------------------------------
rul_model = joblib.load(MODELS_FOLDER / "rul_model.pkl")
preprocessing = joblib.load(MODELS_FOLDER / "preprocessing.pkl")
anomaly_package = joblib.load(MODELS_FOLDER / "anomaly_model.pkl")

with open(MODELS_FOLDER / "metrics.json", encoding="utf-8") as metrics_file:
    model_metrics = json.load(metrics_file)

scaler = preprocessing["scaler"]
feature_columns = preprocessing["feature_columns"]
selected_sensors = preprocessing["selected_sensors"]

anomaly_model = anomaly_package["model"]
anomaly_columns = anomaly_package["columns"]

print("Modèles chargés :", model_metrics["selected_model"], "+ Isolation Forest")


# ------------------------------------------------------------
# Prédiction
# ------------------------------------------------------------
def readings_to_dataframe(readings, machine_id="machine"):
    """Transforme une liste de mesures (dictionnaires) en DataFrame trié par cycle."""
    history = pd.DataFrame(readings)
    history["unit_id"] = machine_id
    history = history.sort_values("cycle").reset_index(drop=True)
    return history


def find_deviating_sensors(last_row, number_of_sensors=3):
    """Retourne les capteurs dont la moyenne mobile s'éloigne le plus du fonctionnement sain.

    L'écart est exprimé en nombre d'écarts-types (z-score).
    Attention : cela n'indique PAS la cause d'une panne.
    """
    deviations = []
    for column in anomaly_columns:
        healthy_mean = anomaly_package["healthy_means"][column]
        healthy_std = anomaly_package["healthy_stds"][column]
        z_score = (last_row[column] - healthy_mean) / healthy_std
        sensor_name = column.replace("_mean", "")
        deviations.append({"sensor": sensor_name, "z_score": round(float(z_score), 2)})

    # Tri par écart absolu décroissant
    deviations.sort(key=lambda item: abs(item["z_score"]), reverse=True)
    return deviations[:number_of_sensors]


def compute_results(feature_rows):
    """Calcule RUL, anomalie, Health Score et état pour des lignes de variables.

    feature_rows : DataFrame produit par build_features (une ou plusieurs lignes).
    Retourne une liste de dictionnaires (un par ligne).
    """
    # 1. Prédiction du RUL (normalisation puis modèle)
    scaled_features = scaler.transform(feature_rows[feature_columns])
    predicted_ruls = rul_model.predict(scaled_features)

    # 2. Score brut d'Isolation Forest (entre 0 et 1, plus grand = plus inhabituel)
    raw_scores = -anomaly_model.score_samples(feature_rows[anomaly_columns])

    results = []
    for index in range(len(feature_rows)):
        row = feature_rows.iloc[index]

        # Le RUL ne peut pas être négatif
        predicted_rul = max(float(predicted_ruls[index]), 0.0)

        # Niveau d'anomalie normalisé entre 0 (sain) et 1 (proche de la panne)
        raw_score = float(raw_scores[index])
        anomaly_level = normalize_anomaly_score(raw_score,
                                                anomaly_package["healthy_reference"],
                                                anomaly_package["failure_reference"])
        is_anomaly = raw_score > anomaly_package["threshold"]

        # 3. Health Score et état
        health_score = compute_health_score(predicted_rul, anomaly_level)

        results.append({
            "cycle": int(row["cycle"]),
            "predicted_rul": round(predicted_rul, 1),
            "anomaly_score": round(anomaly_level, 3),
            "anomaly_raw_score": round(raw_score, 4),
            "is_anomaly": bool(is_anomaly),
            "deviating_sensors": find_deviating_sensors(row),
            "health_score": health_score,
            "state": get_machine_state(health_score),
        })
    return results


def predict_machine(history):
    """Prédit l'état de la machine au DERNIER cycle de l'historique."""
    # Mêmes transformations que dans les notebooks
    features = build_features(history)
    last_row = features.iloc[[-1]]
    return compute_results(last_row)[0]


def predict_all_cycles(history):
    """Prédit l'état de la machine à CHAQUE cycle de l'historique.

    Les variables n'utilisent que le passé : le résultat pour le cycle t est identique
    à celui qu'on obtiendrait en appelant predict_machine avec l'historique jusqu'à t.
    """
    features = build_features(history)
    return compute_results(features)


# ------------------------------------------------------------
# Règles de maintenance (aide à la décision)
# ------------------------------------------------------------
# Les règles sont volontairement simples et lisibles :
#   - la PRIORITÉ dépend de l'état de la machine ;
#   - la RECOMMANDATION dépend de l'état, de la durée de vie restante
#     estimée et de la présence d'un comportement inhabituel.
# Ce ne sont pas des diagnostics : seulement des propositions d'action.

NOT_EVALUATED_STATE = "Non évaluée"

# Seuils (en cycles) de durée de vie restante estimée utilisés par les règles
VERY_SHORT_RUL = 20      # en dessous : vérification rapide par un technicien
SHORT_RUL = 60           # en dessous : inspection préventive à planifier

RECOMMENDATION_NOT_EVALUATED = "Lancer une évaluation de la machine avant toute décision."
RECOMMENDATION_CONTINUE = "Continuer la surveillance habituelle."
RECOMMENDATION_WATCH = "Renforcer la surveillance des capteurs."
RECOMMENDATION_INSPECTION = "Planifier une inspection préventive."
RECOMMENDATION_PRIORITY = "Prévoir une intervention de maintenance prioritaire."
RECOMMENDATION_TECHNICIAN = "Faire vérifier rapidement la machine par un technicien."


def get_priority(state):
    """Niveau de priorité d'intervention selon l'état de la machine."""
    if state == "Critique":
        return "Urgente"
    if state == "Avertissement":
        return "Élevée"
    if state == "Normal":
        return "Normale"
    return NOT_EVALUATED_STATE


def get_recommendation(state, predicted_rul, is_anomaly):
    """Recommandation d'intervention construite avec des règles simples."""
    if state == "Critique":
        if predicted_rul <= VERY_SHORT_RUL:
            return RECOMMENDATION_TECHNICIAN
        return RECOMMENDATION_PRIORITY

    if state == "Avertissement":
        if is_anomaly or predicted_rul <= SHORT_RUL:
            return RECOMMENDATION_INSPECTION
        return RECOMMENDATION_WATCH

    if state == "Normal":
        if is_anomaly:
            return RECOMMENDATION_WATCH
        return RECOMMENDATION_CONTINUE

    return RECOMMENDATION_NOT_EVALUATED


def get_unusual_sensor_labels(result):
    """Noms compréhensibles des mesures les plus éloignées du fonctionnement habituel."""
    labels = []
    for item in result["deviating_sensors"]:
        labels.append(SENSOR_INFO[item["sensor"]]["label"])
    return labels


# ------------------------------------------------------------
# Alertes
# ------------------------------------------------------------
def build_alert_texts(machine_name, result):
    """Construit la description et la recommandation d'une alerte, en langage clair."""
    rul_text = str(round(result["predicted_rul"])) + " cycles"
    health_text = str(round(result["health_score"])) + "/100"

    if result["state"] == "Critique":
        state_text = "Passage à l'état critique"
    else:
        state_text = "Passage à l'état d'avertissement"

    description = (state_text + " de " + machine_name + " : durée de vie restante estimée à "
                   + rul_text + ", score de santé " + health_text + ".")

    recommendation = get_recommendation(result["state"], result["predicted_rul"], result["is_anomaly"])

    if result["is_anomaly"]:
        recommendation = (recommendation
                          + " Comportement inhabituel observé : contrôler en priorité les mesures suivantes "
                          + "(à titre indicatif, ce n'est pas un diagnostic) : "
                          + ", ".join(get_unusual_sensor_labels(result)).lower() + ".")
    return description, recommendation


def create_alert_if_needed(machine_id, machine_name, previous_state, result):
    """Crée une alerte si la machine est en Avertissement ou Critique.

    Pour éviter les doublons :
      - si la machine reste dans le même état, aucune nouvelle alerte ;
      - s'il existe déjà une alerte ACTIVE de même gravité, aucune nouvelle alerte.
    """
    severity = result["state"]
    if severity == "Normal":
        return None

    if severity == previous_state:
        return None

    existing_alert = alerts_collection.find_one({
        "machine_id": machine_id,
        "severity": severity,
        "status": "active",
    })
    if existing_alert is not None:
        return None

    description, recommendation = build_alert_texts(machine_name, result)

    alert = {
        "machine_id": machine_id,
        "machine_name": machine_name,
        "severity": severity,
        "cycle": result["cycle"],
        "estimated_rul": result["predicted_rul"],
        "health_score": result["health_score"],
        "anomaly_score": result["anomaly_score"],
        "description": description,
        "recommendation": recommendation,
        "created_at": datetime.now(),
        "status": "active",
    }
    alerts_collection.insert_one(alert)
    alert["id"] = str(alert.pop("_id"))
    return alert


# ------------------------------------------------------------
# Enregistrement complet d'une nouvelle mesure
# ------------------------------------------------------------
def save_prediction(machine_id, sensor_values, result, measured_at=None):
    """Enregistre la mesure, la prédiction, met à jour la machine et crée une alerte si besoin."""
    if measured_at is None:
        measured_at = datetime.now()

    machine = machines_collection.find_one({"machine_id": machine_id})
    machine_name = machine_id
    previous_state = None
    if machine is not None:
        machine_name = machine["name"]
        previous_state = machine.get("state")

    priority = get_priority(result["state"])
    recommendation = get_recommendation(result["state"], result["predicted_rul"], result["is_anomaly"])

    # Mesures les plus éloignées du fonctionnement habituel (seulement si comportement inhabituel)
    unusual_sensors = []
    if result["is_anomaly"]:
        unusual_sensors = get_unusual_sensor_labels(result)

    # 1. Collection sensor_readings
    sensor_readings_collection.insert_one({
        "machine_id": machine_id,
        "cycle": result["cycle"],
        "sensors": sensor_values,
        "measured_at": measured_at,
    })

    # 2. Collection predictions
    predictions_collection.insert_one({
        "machine_id": machine_id,
        "cycle": result["cycle"],
        "predicted_rul": result["predicted_rul"],
        "health_score": result["health_score"],
        "anomaly_score": result["anomaly_score"],
        "is_anomaly": result["is_anomaly"],
        "state": result["state"],
        "priority": priority,
        "created_at": measured_at,
    })

    # 3. Mise à jour de la machine
    machines_collection.update_one(
        {"machine_id": machine_id},
        {"$set": {
            "state": result["state"],
            "current_rul": result["predicted_rul"],
            "health_score": result["health_score"],
            "anomaly_score": result["anomaly_score"],
            "is_anomaly": result["is_anomaly"],
            "unusual_sensors": unusual_sensors,
            "priority": priority,
            "recommendation": recommendation,
            "current_cycle": result["cycle"],
            "last_update": measured_at,
        }},
    )

    # 4. Alerte éventuelle
    return create_alert_if_needed(machine_id, machine_name, previous_state, result)
