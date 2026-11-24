# ============================================================
# schemas.py
# Modèles Pydantic : validation des données reçues par l'API
# ============================================================

from typing import List, Optional
from pydantic import BaseModel, Field


class SensorReading(BaseModel):
    """Mesures des 14 capteurs utilisés, pour un cycle donné."""
    cycle: int = Field(ge=1, description="Numéro du cycle de fonctionnement")
    sensor_2: float
    sensor_3: float
    sensor_4: float
    sensor_7: float
    sensor_8: float
    sensor_9: float
    sensor_11: float
    sensor_12: float
    sensor_13: float
    sensor_14: float
    sensor_15: float
    sensor_17: float
    sensor_20: float
    sensor_21: float


# Exemple affiché dans Swagger (premier cycle du moteur NASA n°1)
EXAMPLE_READING = {
    "cycle": 1, "sensor_2": 641.82, "sensor_3": 1589.70, "sensor_4": 1400.60,
    "sensor_7": 554.36, "sensor_8": 2388.06, "sensor_9": 9046.19, "sensor_11": 47.47,
    "sensor_12": 521.66, "sensor_13": 2388.02, "sensor_14": 8138.62, "sensor_15": 8.4195,
    "sensor_17": 392, "sensor_20": 39.06, "sensor_21": 23.4190,
}


class PredictRequest(BaseModel):
    """Données envoyées à /predict et /detect-anomaly.

    readings : historique des mesures du moteur, du plus ancien au plus récent.
    La prédiction est faite pour le DERNIER cycle de la liste.
    machine_id : (optionnel) si fourni, le résultat est enregistré dans MongoDB.
    """
    machine_id: Optional[str] = None
    readings: List[SensorReading] = Field(min_length=1)

    model_config = {
        "json_schema_extra": {
            "examples": [{"machine_id": None, "readings": [EXAMPLE_READING]}]
        }
    }


class SimulationStartRequest(BaseModel):
    """Paramètres de démarrage d'une simulation."""
    machine_id: str
    speed: float = Field(default=2, gt=0, le=20, description="Nombre de cycles simulés par seconde")


class SimulationSpeedRequest(BaseModel):
    """Nouvelle vitesse de simulation."""
    speed: float = Field(gt=0, le=20, description="Nombre de cycles simulés par seconde")


class AlertStatusUpdate(BaseModel):
    """Nouveau statut d'une alerte."""
    status: str = Field(pattern="^(active|traitée)$")
