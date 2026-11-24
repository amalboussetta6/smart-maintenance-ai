# ============================================================
# features.py
# Fonctions de préparation des données (Feature Engineering)
#
# Ce fichier est utilisé à la fois :
#   - par les notebooks (entraînement des modèles)
#   - par le backend FastAPI (prédictions dans l'application)
# Ainsi, les transformations sont exactement les mêmes partout.
# ============================================================

import pandas as pd


# Noms des 26 colonnes des fichiers NASA C-MAPSS
COLUMN_NAMES = ["unit_id", "cycle",
                "op_setting_1", "op_setting_2", "op_setting_3"]
for sensor_number in range(1, 22):
    COLUMN_NAMES.append("sensor_" + str(sensor_number))

# Les 14 capteurs retenus après l'analyse exploratoire
# (les 7 autres capteurs sont constants dans FD001)
SELECTED_SENSORS = [
    "sensor_2", "sensor_3", "sensor_4", "sensor_7",
    "sensor_8", "sensor_9", "sensor_11", "sensor_12",
    "sensor_13", "sensor_14", "sensor_15", "sensor_17",
    "sensor_20", "sensor_21",
]

# Taille de la fenêtre de la moyenne mobile (en cycles)
ROLLING_WINDOW = 10

# Valeur maximale du RUL utilisée pour l'apprentissage
# (au début de sa vie, un moteur est considéré "en pleine santé")
MAX_RUL = 125


def load_cmapss_file(file_path):
    """Charge un fichier texte NASA C-MAPSS et nomme les colonnes."""
    # Les valeurs sont séparées par des espaces
    data = pd.read_csv(file_path, sep=r"\s+", header=None)

    # Les fichiers contiennent parfois des colonnes vides à la fin
    data = data.iloc[:, :26]
    data.columns = COLUMN_NAMES
    return data


def add_rul_column(data):
    """Calcule le RUL réel de chaque ligne du jeu d'entraînement.

    RUL = dernier cycle du moteur - cycle actuel
    Le RUL est ensuite limité à MAX_RUL (RUL "plafonné").
    """
    data = data.copy()

    # Dernier cycle observé pour chaque moteur
    last_cycle = data.groupby("unit_id")["cycle"].transform("max")

    # Nombre de cycles restants avant la panne
    data["RUL"] = last_cycle - data["cycle"]

    # Plafonnement du RUL
    data["RUL"] = data["RUL"].clip(upper=MAX_RUL)
    return data


def build_features(data):
    """Construit les variables utilisées par les modèles.

    Pour chaque capteur retenu, on crée :
      - la valeur brute            (ex : sensor_2)
      - la moyenne mobile          (ex : sensor_2_mean)
      - la variation de la moyenne (ex : sensor_2_trend)

    Les calculs sont faits moteur par moteur et n'utilisent
    QUE les cycles passés : aucune information du futur.
    """
    data = data.sort_values(["unit_id", "cycle"]).copy()

    for sensor in SELECTED_SENSORS:
        # Groupement des valeurs du capteur par moteur
        sensor_by_unit = data.groupby("unit_id")[sensor]

        # Moyenne mobile sur les derniers cycles (lisse le bruit)
        mean_column = sensor + "_mean"
        data[mean_column] = sensor_by_unit.transform(
            lambda values: values.rolling(ROLLING_WINDOW, min_periods=1).mean()
        )

        # Variation : moyenne actuelle - moyenne d'il y a ROLLING_WINDOW cycles
        trend_column = sensor + "_trend"
        data[trend_column] = data.groupby("unit_id")[mean_column].diff(ROLLING_WINDOW)

        # Au début de la vie du moteur, pas assez d'historique : variation = 0
        data[trend_column] = data[trend_column].fillna(0.0)

    return data


def get_feature_columns():
    """Retourne la liste ordonnée des variables d'entrée des modèles."""
    feature_columns = ["cycle"]
    for sensor in SELECTED_SENSORS:
        feature_columns.append(sensor)
        feature_columns.append(sensor + "_mean")
        feature_columns.append(sensor + "_trend")
    return feature_columns


def get_anomaly_columns():
    """Variables utilisées par Isolation Forest (moyennes mobiles des capteurs)."""
    anomaly_columns = []
    for sensor in SELECTED_SENSORS:
        anomaly_columns.append(sensor + "_mean")
    return anomaly_columns


# ============================================================
# Score d'anomalie normalisé et Health Score
# ============================================================

# Poids des deux composantes du Health Score (somme = 1)
HEALTH_RUL_WEIGHT = 0.7
HEALTH_ANOMALY_WEIGHT = 0.3

# Seuils des états de la machine
NORMAL_THRESHOLD = 70
CRITICAL_THRESHOLD = 30


def normalize_anomaly_score(raw_score, healthy_reference, failure_reference):
    """Transforme le score brut d'Isolation Forest en un niveau entre 0 et 1.

    0 = comportement identique à un moteur sain
    1 = comportement identique à un moteur juste avant la panne
    """
    level = (raw_score - healthy_reference) / (failure_reference - healthy_reference)

    # On garde la valeur dans l'intervalle [0, 1]
    if level < 0:
        level = 0.0
    if level > 1:
        level = 1.0
    return level


def compute_health_score(predicted_rul, anomaly_level):
    """Calcule le Health Score (0 à 100) à partir du RUL prédit et du niveau d'anomalie."""
    # Composante RUL : 1 = RUL maximal, 0 = panne imminente
    rul_part = min(max(predicted_rul, 0), MAX_RUL) / MAX_RUL

    # Composante anomalie : 1 = aucun comportement inhabituel
    anomaly_part = 1 - anomaly_level

    health_score = 100 * (HEALTH_RUL_WEIGHT * rul_part + HEALTH_ANOMALY_WEIGHT * anomaly_part)
    return round(health_score, 1)


def get_machine_state(health_score):
    """Retourne l'état de la machine selon son Health Score."""
    if health_score >= NORMAL_THRESHOLD:
        return "Normal"
    elif health_score >= CRITICAL_THRESHOLD:
        return "Avertissement"
    else:
        return "Critique"


# ============================================================
# Description des capteurs pour l'interface utilisateur
# Unités issues de la documentation du dataset C-MAPSS
# (Saxena et al., 2008). Une unité vide = grandeur sans unité.
#   °R   = degrés Rankine (échelle de température absolue)
#   psia = livres par pouce carré (pression absolue)
#   tr/min = tours par minute
#   pps/psi = débit de carburant (livres/s) par psi
#   lbm/s = livres-masse par seconde
# ============================================================
SENSOR_INFO = {
    "sensor_2": {"label": "Température en sortie du compresseur basse pression", "unit": "°R"},
    "sensor_3": {"label": "Température en sortie du compresseur haute pression", "unit": "°R"},
    "sensor_4": {"label": "Température en sortie de la turbine basse pression", "unit": "°R"},
    "sensor_7": {"label": "Pression en sortie du compresseur haute pression", "unit": "psia"},
    "sensor_8": {"label": "Vitesse de rotation du ventilateur", "unit": "tr/min"},
    "sensor_9": {"label": "Vitesse de rotation du cœur du moteur", "unit": "tr/min"},
    "sensor_11": {"label": "Pression statique en sortie du compresseur haute pression", "unit": "psia"},
    "sensor_12": {"label": "Rapport débit de carburant / pression statique", "unit": "pps/psi"},
    "sensor_13": {"label": "Vitesse corrigée du ventilateur", "unit": "tr/min"},
    "sensor_14": {"label": "Vitesse corrigée du cœur du moteur", "unit": "tr/min"},
    "sensor_15": {"label": "Taux de dilution", "unit": ""},
    "sensor_17": {"label": "Enthalpie de prélèvement d'air", "unit": ""},
    "sensor_20": {"label": "Débit d'air de refroidissement de la turbine haute pression", "unit": "lbm/s"},
    "sensor_21": {"label": "Débit d'air de refroidissement de la turbine basse pression", "unit": "lbm/s"},
}
