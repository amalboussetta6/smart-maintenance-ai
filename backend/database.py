# ============================================================
# database.py
# Connexion à MongoDB avec PyMongo
# ============================================================

from pymongo import MongoClient, ASCENDING, DESCENDING

# Adresse du serveur MongoDB local (service Windows)
MONGO_URL = "mongodb://localhost:27017"
DATABASE_NAME = "smart_maintenance"

# Connexion au serveur (timeout court pour afficher rapidement une erreur claire)
client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
database = client[DATABASE_NAME]

# Les quatre collections principales
machines_collection = database["machines"]
sensor_readings_collection = database["sensor_readings"]
predictions_collection = database["predictions"]
alerts_collection = database["alerts"]


def check_connection():
    """Vérifie que MongoDB répond. Lève une erreur claire sinon."""
    try:
        client.admin.command("ping")
    except Exception as error:
        message = ("Impossible de se connecter à MongoDB (" + MONGO_URL + "). "
                   "Vérifiez que le service MongoDB est démarré.")
        raise RuntimeError(message) from error


def create_indexes():
    """Crée des index pour accélérer les recherches fréquentes."""
    machines_collection.create_index("machine_id", unique=True)
    sensor_readings_collection.create_index([("machine_id", ASCENDING), ("cycle", ASCENDING)])
    predictions_collection.create_index([("machine_id", ASCENDING), ("cycle", ASCENDING)])
    predictions_collection.create_index([("created_at", DESCENDING)])
    alerts_collection.create_index([("machine_id", ASCENDING), ("status", ASCENDING)])


def clean_document(document):
    """Convertit un document MongoDB en dictionnaire envoyable en JSON.

    L'identifiant MongoDB (_id, de type ObjectId) est converti en texte
    dans un champ "id".
    """
    if document is None:
        return None
    document["id"] = str(document["_id"])
    del document["_id"]
    return document


def clean_documents(documents):
    """Applique clean_document à une liste de documents."""
    result = []
    for document in documents:
        result.append(clean_document(document))
    return result
