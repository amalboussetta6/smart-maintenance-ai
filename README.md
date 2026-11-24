# Smart Maintenance AI

**Conception et développement d'une application intelligente de maintenance prédictive des machines industrielles basée sur le Machine Learning.**

Projet d'intégration — cycle ingénieur informatique, spécialité intelligence artificielle.

---

## Sommaire

1. [Présentation du projet](#1-présentation-du-projet)
2. [Problématique et objectifs](#2-problématique-et-objectifs)
3. [Technologies utilisées](#3-technologies-utilisées)
4. [Le dataset NASA C-MAPSS FD001](#4-le-dataset-nasa-c-mapss-fd001)
5. [Architecture générale](#5-architecture-générale)
6. [Structure des dossiers et rôle des fichiers](#6-structure-des-dossiers-et-rôle-des-fichiers)
7. [Partie intelligence artificielle](#7-partie-intelligence-artificielle)
8. [Résultats réels des entraînements](#8-résultats-réels-des-entraînements)
9. [Installation](#9-installation)
10. [Lancement de l'application](#10-lancement-de-lapplication)
11. [Fonctionnalités de l'application](#11-fonctionnalités-de-lapplication)
12. [Communication entre les parties](#12-communication-entre-angular-fastapi-les-modèles-ia-et-mongodb)
13. [Vérifications manuelles](#13-vérifications-manuelles)
14. [Limites du projet](#14-limites-du-projet)
15. [Perspectives d'amélioration](#15-perspectives-damélioration)

---

## 1. Présentation du projet

Smart Maintenance AI est une application web d'**aide à la décision** destinée à un **responsable ou technicien de maintenance industrielle**, sans connaissance particulière en intelligence artificielle. Elle surveille l'état de moteurs industriels (moteurs d'avion turbofan) à partir des mesures de leurs capteurs.

Le projet comporte deux niveaux de lecture :

- **L'interface Angular** est un outil métier : état des machines, durée de vie restante estimée, score de santé, alertes, priorités et recommandations d'intervention, en français et sans jargon technique.
- **Les notebooks Jupyter et ce README** contiennent toute la partie scientifique (modèles, métriques, comparaisons, explicabilité) destinée à la soutenance.

En arrière-plan, l'application :

- prédit la **durée de vie restante** (RUL — *Remaining Useful Life*) avec un modèle de régression ;
- détecte les **comportements inhabituels** avec Isolation Forest ;
- calcule un **Health Score** (0 à 100) et un état (Normal / Avertissement / Critique) ;
- génère des **alertes de maintenance** avec une recommandation ;
- **simule** la dégradation d'un moteur cycle par cycle à partir des vraies données NASA ;
- conserve l'**historique** des estimations dans MongoDB (filtrable et exportable en CSV) ;
- classe les machines par **priorité d'intervention** avec une recommandation simple.

La comparaison des modèles et l'importance des capteurs sont présentées dans les notebooks (et dans la section 8), pas dans l'interface utilisateur.

## 2. Problématique et objectifs

**Problématique :** comment anticiper la panne d'une machine à partir des mesures de ses capteurs, pour intervenir *avant* la panne (maintenance prédictive) plutôt qu'*après* (maintenance corrective) ou *trop tôt* (maintenance préventive systématique) ?

**Objectifs :**

- surveiller l'état des machines et analyser les données des capteurs ;
- prédire le RUL et détecter les anomalies ;
- calculer un score de santé et générer des alertes ;
- simuler le fonctionnement et la dégradation des machines ;
- consulter l'historique des prédictions ;
- comparer trois modèles de Machine Learning ;
- identifier les capteurs les plus importants.

## 3. Technologies utilisées

| Partie | Technologies |
|---|---|
| Intelligence artificielle | Python, Pandas, NumPy, Matplotlib, Seaborn, Scikit-learn, Jupyter Notebook, Joblib |
| Backend | FastAPI, Uvicorn, Pydantic, API REST, Swagger |
| Base de données | MongoDB Community Server (local), MongoDB Compass, PyMongo |
| Frontend | Angular 20, TypeScript, HTML, CSS, Chart.js, Bootstrap Icons (icônes uniquement), police Inter, interface en français (dates et nombres au format français) |
| Environnement | Windows, Visual Studio Code, environnement virtuel Python, Node.js, npm, Angular CLI |

Volontairement **non utilisés** : Docker, Kubernetes, PostgreSQL, microservices, WebSocket, Deep Learning (LSTM, GRU, TensorFlow, PyTorch), tests automatisés, CI/CD, NgRx, frameworks UI.

## 4. Le dataset NASA C-MAPSS FD001

### Origine
Le dataset **C-MAPSS** (*Commercial Modular Aero-Propulsion System Simulation*) a été publié par le **Prognostics Center of Excellence de la NASA Ames** (A. Saxena et al., 2008). Il contient des données **simulées** de moteurs turbofan, et c'est une référence en maintenance prédictive.

Les fichiers ont été récupérés depuis deux dépôts GitHub publics indépendants qui redistribuent le jeu officiel ; leurs sommes de contrôle MD5 sont identiques (le site de la NASA n'était pas accessible depuis l'environnement de travail).

### Sous-ensemble FD001
| | Entraînement | Test |
|---|---|---|
| Moteurs | 100 | 100 |
| Lignes (cycles) | 20 631 | 13 096 |
| Conditions de vol | 1 (niveau de la mer) | 1 |
| Mode de panne | dégradation du compresseur haute pression (HPC) | idem |

- **Cycle** : un cycle de fonctionnement (un vol). Chaque ligne = un moteur à un cycle donné.
- **Entraînement** : chaque moteur fonctionne **jusqu'à la panne** (durée de vie de 128 à 362 cycles).
- **Test** : les séries sont **coupées avant la panne** ; `RUL_FD001.txt` donne le vrai RUL restant (de 7 à 145 cycles).
- **Paramètres opérationnels** : 3 réglages (altitude, Mach, manette des gaz), quasi constants dans FD001.
- **21 capteurs** : températures, pressions, vitesses de rotation, débits… (tableau complet dans le notebook 01).

### Dégradation et RUL
Chaque moteur démarre avec une usure initiale inconnue, puis une panne se développe progressivement. Les capteurs restent stables en début de vie, puis dérivent de plus en plus vite.

**RUL = dernier cycle du moteur − cycle actuel** : nombre de cycles restants avant la panne.

## 5. Architecture générale

```
┌────────────────────┐   HTTP REST (JSON)   ┌─────────────────────┐   PyMongo   ┌──────────────┐
│ Frontend Angular   │ ───────────────────► │  Backend FastAPI    │ ──────────► │  MongoDB     │
│ localhost:4200     │ ◄─────────────────── │  localhost:8000     │ ◄────────── │  :27017      │
│ 6 pages, Chart.js  │                      │  main.py            │             │ smart_       │
└────────────────────┘                      │        │            │             │ maintenance  │
                                            │        ▼            │             └──────────────┘
                                            │  Modèles IA (.pkl)  │
                                            │  chargés au démarrage│
                                            └─────────────────────┘
                     Notebooks Jupyter ──► entraînent et sauvegardent les modèles dans models/
```

Quatre parties simples :
1. **IA** (notebooks) : analyse, entraînement, sauvegarde des modèles.
2. **Backend FastAPI** : charge les modèles, calcule les prédictions, lit/écrit dans MongoDB, expose l'API REST.
3. **MongoDB** : stocke machines, mesures, prédictions et alertes.
4. **Frontend Angular** : interface, graphiques, simulation (requêtes HTTP périodiques, pas de WebSocket).

## 6. Structure des dossiers et rôle des fichiers

```
smart-maintenance-ai/
├── data/
│   ├── train_FD001.txt, test_FD001.txt, RUL_FD001.txt   ← dataset NASA
│   └── processed/                ← données préparées par le notebook 02
├── notebooks/                    ← 6 notebooks exécutés (résultats visibles)
├── models/
│   ├── rul_model.pkl             ← modèle final de prédiction du RUL
│   ├── anomaly_model.pkl         ← Isolation Forest + références de normalisation
│   ├── preprocessing.pkl         ← StandardScaler + liste des variables
│   ├── metrics.json              ← métriques réelles (consultables via Swagger : GET /models/metrics)
│   └── candidates/               ← les 3 modèles entraînés (pour la comparaison)
├── backend/
│   ├── main.py                   ← l'API FastAPI (tous les endpoints)
│   ├── database.py               ← connexion MongoDB et collections
│   ├── schemas.py                ← modèles Pydantic (validation des entrées)
│   ├── features.py               ← préparation des données + Health Score + libellés des capteurs (partagé avec les notebooks)
│   ├── prediction.py             ← chargement des modèles, prédictions, règles de maintenance, alertes
│   ├── simulation.py             ← machines de démonstration et simulation cycle par cycle
│   └── requirements.txt
├── frontend/                     ← application Angular
│   └── src/
│       ├── styles.css            ← feuille de style globale (identité visuelle)
│       └── app/
│           ├── app.ts/html/css   ← barre latérale + en-tête
│           ├── app.routes.ts     ← routing des 6 pages
│           ├── services/api.service.ts     ← tous les appels HTTP
│           ├── services/chart-helpers.ts   ← couleurs et fonctions Chart.js
│           ├── services/display.ts         ← badges, couleurs des états, textes des infobulles
│           └── pages/            ← dashboard, machines, machine-detail, simulation,
│                                    alerts, history, maintenance
├── README.md
└── .gitignore
```

**Point clé :** `backend/features.py` est importé **à la fois** par les notebooks et par le backend. Les transformations utilisées à l'entraînement sont donc exactement celles utilisées dans l'application.

## 7. Partie intelligence artificielle

### 7.1 Analyse exploratoire (notebook 01)
- Aucune valeur manquante, aucun doublon.
- 7 capteurs constants (`sensor_1, 5, 6, 10, 16, 18, 19`) et les 3 paramètres opérationnels n'apportent pas d'information.
- **14 capteurs retenus** : `sensor_2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 17, 20, 21`.
- Les capteurs sont bruités et ne dérivent qu'en fin de vie (au-delà d'environ 125 cycles avant la panne, ils sont stables).

### 7.2 Prétraitement (notebook 02)
- Noms explicites des colonnes, suppression des variables inutiles.
- **RUL plafonné à 125 cycles** (méthode classique « linéaire par morceaux ») : en début de vie, le moteur est simplement « en bonne santé ».
- **Feature engineering** pour chaque capteur : valeur brute, **moyenne mobile sur 10 cycles**, **variation** (moyenne actuelle − moyenne d'il y a 10 cycles), plus le numéro de cycle → **43 variables**.
- Calculs faits **moteur par moteur** et **uniquement à partir du passé** : pas d'information du futur.
- Séparation **par moteur** : 80 moteurs d'entraînement, 20 de validation (aucun moteur commun → pas de fuite).
- `StandardScaler` ajusté **uniquement sur l'entraînement**.
- Le jeu de test officiel NASA est réservé à l'évaluation finale (dernier cycle observé de chaque moteur).

### 7.3 Prédiction du RUL (notebooks 03 et 04)

| Modèle | Principe | Paramètres |
|---|---|---|
| **Linear Regression** | combinaison linéaire des variables (moindres carrés), modèle de référence | par défaut |
| **Random Forest Regressor** | moyenne de nombreux arbres entraînés sur des échantillons aléatoires | 150 arbres, profondeur max 12, 5 exemples min. par feuille, 50 % des variables par division |
| **Gradient Boosting Regressor** | arbres construits successivement, chacun corrige les erreurs des précédents | 300 arbres, learning rate 0,05, profondeur 4, sous-échantillonnage 80 % |

Métriques : **MAE** (erreur moyenne en cycles), **RMSE** (pénalise les grosses erreurs), **R²** (part de variance expliquée).

Le modèle est **sélectionné selon le RMSE de validation**, puis **seul le modèle sélectionné** est évalué sur le test NASA. Le test n'intervient jamais dans le choix.

### 7.4 Détection d'anomalies — Isolation Forest (notebook 05)
- **Principe :** une observation inhabituelle est isolée en peu de coupures aléatoires ; une observation normale en demande beaucoup. La longueur moyenne du chemin donne un score $s \in (0, 1]$ (proche de 1 = inhabituel).
- **Référence saine :** cycles des moteurs d'entraînement avec un RUL ≥ 125 (6 340 observations). Variables : moyennes mobiles des 14 capteurs.
- **Paramètres :** 200 arbres, `contamination = 0.02` (2 % de fausses alertes acceptées sur le fonctionnement sain).
- **Score lisible :** niveau d'anomalie = (s − s_sain) / (s_panne − s_sain), borné entre 0 et 1, avec s_sain = 0,4505 (médiane sur les cycles sains) et s_panne = 0,7005 (médiane sur les 10 derniers cycles avant la panne).
- **Limite :** le dataset ne contient **pas d'étiquettes d'anomalies**, donc **aucune Accuracy, Precision, Recall ou F1-score** n'est calculée. L'évaluation est qualitative : le pourcentage de cycles détectés comme inhabituels augmente quand la panne approche (voir résultats).

### 7.5 Health Score
$$\text{Health Score} = 100 \times \left(0{,}7 \times \frac{\min(\hat{RUL}, 125)}{125} + 0{,}3 \times (1 - \text{niveau d'anomalie})\right)$$

- **0,7** pour le RUL : information principale, issue d'un modèle supervisé évalué quantitativement.
- **0,3** pour l'anomalie : signal complémentaire non supervisé.
- États : **Normal** ≥ 70 · **Avertissement** de 30 à 70 · **Critique** < 30.

> Le Health Score est un **indicateur pédagogique d'aide à la décision**, et non un indicateur industriel certifié.

### 7.6 Explicabilité — XAI (notebook 06)
- **Feature Importance** (réduction d'erreur apportée par chaque variable dans les arbres).
- **Permutation Importance** (augmentation du RMSE quand on mélange une variable), calculée sur la validation et regroupée par capteur.
- ⚠️ L'importance d'un capteur montre qu'il est **utile au modèle**, **pas** qu'il est la **cause** d'une panne.

## 8. Résultats réels des entraînements

Résultats obtenus lors de l'exécution des notebooks (`random_state = 42`, scikit-learn 1.9.1).

### Validation (20 moteurs, 4 291 cycles)

| Modèle | MAE | RMSE | R² |
|---|---|---|---|
| Linear Regression | 14,29 | 17,52 | 0,8219 |
| Random Forest Regressor | 10,43 | 14,96 | 0,8702 |
| **Gradient Boosting Regressor** ✅ | **10,32** | **14,58** | **0,8767** |

→ **Modèle sélectionné : Gradient Boosting Regressor** (plus faible RMSE de validation).

### Test officiel NASA (100 moteurs, dernier cycle observé)

| Modèle | MAE | RMSE | R² |
|---|---|---|---|
| Gradient Boosting Regressor | **11,32** | **15,31** | **0,8642** |

72 moteurs sur 100 ont une erreur absolue inférieure à 15 cycles.

### RMSE de validation selon la proximité de la panne

| RUL réel | 0-25 | 25-50 | 50-75 | 75-100 | 100-125 |
|---|---|---|---|---|---|
| Linear Regression | 15,03 | 19,34 | 21,27 | 16,17 | 16,97 |
| Random Forest | 5,82 | 16,13 | 21,73 | 19,59 | 12,96 |
| Gradient Boosting | **5,06** | 14,58 | 20,75 | 19,19 | 13,11 |

Les modèles à base d'arbres sont **très précis près de la panne** (RMSE ≈ 5 cycles), ce qui est le plus important en maintenance.

### Isolation Forest — pourcentage de cycles détectés comme inhabituels (validation)

| RUL réel | 0-25 | 25-50 | 50-75 | 75-100 | 100-125 |
|---|---|---|---|---|---|
| % inhabituel | 100 % | 82,0 % | 39,2 % | 18,8 % | 3,6 % |

### Capteurs les plus importants (Permutation Importance, modèle sélectionné)
1. `sensor_15` — BPR, taux de dilution
2. `sensor_4` — T50, température en sortie de turbine basse pression
3. `sensor_2` — T24, température en sortie du compresseur basse pression
4. `sensor_12` — phi, rapport carburant / pression
5. `sensor_13` — NRf, vitesse corrigée du ventilateur

La variable `cycle` (âge du moteur) est aussi très utilisée par le modèle (voir limites).

## 9. Installation

### 9.1 Vérifier les logiciels
Ouvrir un terminal **PowerShell** et taper :

```powershell
python --version        # Python 3.12, 3.13 ou 3.14 (3.12 recommandé ; 3.11 ne convient pas aux versions fixées)
pip --version
node --version          # Node.js 20.19+, 22.12+ ou 24+
npm --version
ng version              # Angular CLI (facultatif : le projet utilise sa propre version)
```

Si un logiciel manque :
- Python : https://www.python.org/downloads/ (cocher « Add python.exe to PATH ») ;
- Node.js LTS : https://nodejs.org/ ;
- Angular CLI : `npm install -g @angular/cli@20` ;
- MongoDB Community Server + Compass : https://www.mongodb.com/try/download/community (voir 9.2).

### 9.2 MongoDB (service Windows)
1. Installer **MongoDB Community Server** avec l'option **« Install MongoD as a Service »** (cochée par défaut) et laisser cocher **MongoDB Compass**.
2. Vérifier que le service tourne : touche Windows → « Services » → **MongoDB Server** doit être « En cours d'exécution ». Sinon, dans un PowerShell **administrateur** : `net start MongoDB`.
3. Dans Compass, se connecter à `mongodb://localhost:27017`.

La base **`smart_maintenance`** et ses 4 collections (`machines`, `sensor_readings`, `predictions`, `alerts`) sont **créées automatiquement** au premier démarrage du backend.

### 9.3 Environnement virtuel Python
Depuis le dossier `smart-maintenance-ai` :

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

> Si PowerShell refuse d'activer l'environnement : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, puis relancer la commande d'activation.
>
> Les versions de `requirements.txt` sont celles utilisées pour entraîner les modèles : les fichiers `.pkl` de scikit-learn doivent être relus avec la **même version** de scikit-learn.

### 9.4 Dépendances Angular
```powershell
cd frontend
npm install
```

## 10. Lancement de l'application

Ouvrir **deux terminaux** (MongoDB tourne déjà comme service Windows).

**Terminal 1 — Backend** (environnement virtuel activé) :
```powershell
cd backend
uvicorn main:app --reload
```
- API : http://localhost:8000
- Swagger : http://localhost:8000/docs

Au **premier** démarrage, le backend crée 20 machines de démonstration et remplit l'historique (environ 20 secondes).

**Terminal 2 — Frontend** :
```powershell
cd frontend
ng serve
```
(ou `npm start` si Angular CLI n'est pas installé globalement)

- Application : http://localhost:4200

### Exécuter les notebooks (facultatif : ils sont déjà exécutés)
```powershell
cd notebooks
jupyter notebook
```
Les exécuter **dans l'ordre** de 01 à 06 (le 02 produit `data/processed/`, le 04 produit `rul_model.pkl` et `metrics.json`, etc.). Ils sont reproductibles (graine aléatoire fixée à 42). Après un ré-entraînement, redémarrer le backend.

### Réinitialiser les données de démonstration
Dans Swagger : `POST /machines/reset` (supprime tout et recrée les 20 machines).

## 11. Fonctionnalités de l'application (interface métier)

L'interface est pensée pour un **responsable de maintenance**. Elle n'affiche **aucune information technique** sur les algorithmes (noms des modèles, MAE/RMSE/R², hyperparamètres, prétraitement…). Ces informations restent disponibles dans les notebooks, dans ce README et, pour les développeurs, via l'endpoint `GET /models/metrics` de Swagger.

### Vocabulaire utilisé dans l'interface

| Terme technique | Terme affiché à l'utilisateur |
|---|---|
| RUL (*Remaining Useful Life*) | Durée de vie restante estimée (en cycles) |
| Health Score | Score de santé (sur 100) |
| Anomaly Score (niveau normalisé) | Indicateur d'anomalie (en %, avec un libellé Faible < 30 %, Modéré < 60 %, Élevé) |
| `is_anomaly` (Isolation Forest) | Comportement inhabituel (oui / non) |
| Prédiction | Estimation de la durée de vie restante |
| Avertissement | Machine « à surveiller » |

Des **infobulles** (icône ⓘ) expliquent ces notions. Un rappel indique sur plusieurs pages que les résultats sont des **estimations destinées à l'aide à la décision**.

### Les six pages

| Page | Contenu |
|---|---|
| **Tableau de bord** | machines suivies, fonctionnement normal, à surveiller, critiques, non évaluées (si besoin), alertes non traitées, score de santé moyen des machines évaluées ; répartition des états ; score de santé de chaque machine ; machines nécessitant une intervention urgente ; dernières alertes ; date de dernière actualisation (rafraîchissement automatique toutes les 10 s et bouton « Actualiser »). |
| **Machines** | pour chaque machine : identifiant, nom, état, durée de vie restante estimée, score de santé, anomalies, priorité, recommandation, dernière actualisation ; recherche et filtres par état et priorité. La page de **détails** montre l'évolution de l'état (score de santé avec les seuils 70 / 30), de la durée de vie restante, des mesures des capteurs (intitulés compréhensibles et unités) et de l'indicateur d'anomalie, ainsi que les dernières estimations et les alertes. |
| **Simulation** | sélection de la machine, démarrer / pause / reprendre / arrêter, vitesse modifiable même pendant la simulation ; cycle actuel, état, durée de vie restante, score de santé, comportement inhabituel, priorité et recommandation en direct ; graphiques d'évolution ; alertes générées. Un bandeau rappelle que les données proviennent du dataset NASA et non de machines connectées. |
| **Alertes** | machine, date et heure, gravité, description en langage clair, durée de vie restante estimée, recommandation, statut ; recherche, filtres (gravité, statut) et bouton « Marquer comme traitée ». Le nombre d'alertes non traitées est affiché dans l'en-tête et dans le menu. |
| **Historique** | toutes les estimations enregistrées ; filtres par machine, période (du… au…), état, comportement inhabituel et recherche ; pagination ; graphique d'évolution de la machine choisie ; **export CSV** des lignes filtrées (séparateur « ; », compatible Excel). |
| **Maintenance** | machines regroupées par priorité (urgente, élevée, normale, puis non évaluées), avec état, durée de vie restante, score de santé, anomalies observées et recommandation d'intervention ; onglets de filtre, bouton « Imprimer le plan » et rappel des règles utilisées. |

### Priorités et recommandations (règles simples, `backend/prediction.py`)

| Situation de la machine | Priorité | Recommandation |
|---|---|---|
| État critique et durée de vie restante estimée ≤ 20 cycles | Urgente | Faire vérifier rapidement la machine par un technicien. |
| État critique | Urgente | Prévoir une intervention de maintenance prioritaire. |
| Avertissement avec comportement inhabituel, ou durée de vie restante ≤ 60 cycles | Élevée | Planifier une inspection préventive. |
| Avertissement | Élevée | Renforcer la surveillance des capteurs. |
| État normal avec comportement inhabituel | Normale | Renforcer la surveillance des capteurs. |
| État normal | Normale | Continuer la surveillance habituelle. |
| Aucune estimation disponible | Non évaluée | Lancer une évaluation de la machine avant toute décision. |

Ces règles utilisent uniquement les résultats réels des modèles (état issu du score de santé, durée de vie restante estimée, comportement inhabituel détecté). Ce ne sont **pas des diagnostics** : lorsqu'un comportement inhabituel est détecté, l'application cite les mesures les plus éloignées du fonctionnement habituel (écart à la moyenne des cycles sains) **à titre indicatif**, en précisant qu'elles ne désignent pas la cause d'une panne.

### Machines non évaluées

Une machine sans aucune estimation (par exemple au tout début d'une simulation) a l'état **« Non évaluée »** : elle n'est jamais comptée comme saine, n'entre pas dans le score de santé moyen et apparaît en gris.

### Intitulés et unités des capteurs

Les capteurs sont présentés avec des intitulés en français. Les unités viennent de la documentation du dataset C-MAPSS (Saxena et al., 2008) : °R (degrés Rankine), psia (livres par pouce carré, pression absolue), tr/min, pps/psi, lbm/s (livres-masse par seconde). Le taux de dilution et l'enthalpie de prélèvement sont sans unité.

| Capteur | Intitulé affiché | Unité |
|---|---|---|
| sensor_2 | Température en sortie du compresseur basse pression | °R |
| sensor_3 | Température en sortie du compresseur haute pression | °R |
| sensor_4 | Température en sortie de la turbine basse pression | °R |
| sensor_7 | Pression en sortie du compresseur haute pression | psia |
| sensor_8 | Vitesse de rotation du ventilateur | tr/min |
| sensor_9 | Vitesse de rotation du cœur du moteur | tr/min |
| sensor_11 | Pression statique en sortie du compresseur haute pression | psia |
| sensor_12 | Rapport débit de carburant / pression statique | pps/psi |
| sensor_13 | Vitesse corrigée du ventilateur | tr/min |
| sensor_14 | Vitesse corrigée du cœur du moteur | tr/min |
| sensor_15 | Taux de dilution | — |
| sensor_17 | Enthalpie de prélèvement d'air | — |
| sensor_20 | Débit d'air de refroidissement de la turbine haute pression | lbm/s |
| sensor_21 | Débit d'air de refroidissement de la turbine basse pression | lbm/s |

**Les machines** sont les **20 moteurs de validation** (jamais vus pendant l'entraînement). Au démarrage, chaque moteur a déjà parcouru entre 35 % et 95 % de sa vie réelle, ce qui donne un parc avec des états variés.

**Les alertes** sont créées quand une machine **passe** en Avertissement ou en Critique. Pour éviter les doublons, aucune alerte n'est recréée si la machine reste dans le même état ou s'il existe déjà une alerte non traitée de même gravité.

### Endpoints de l'API

| Méthode | Endpoint | Fonction |
|---|---|---|
| GET | `/machines` | liste des machines (état, priorité, recommandation…) |
| GET | `/machines/{id}` | détails d'une machine (mesures, prédictions, anomalies, alertes) |
| POST | `/machines/reset` | réinitialise les données de démonstration |
| POST | `/predict` | RUL, anomalie, Health Score et état (enregistré si `machine_id` est fourni) |
| POST | `/detect-anomaly` | détection d'anomalie (Isolation Forest) |
| GET | `/predictions` | historique des prédictions (filtres `machine_id`, `state`) |
| GET | `/alerts` | liste des alertes (filtres `severity`, `status`) |
| GET | `/alerts/count` | nombre d'alertes non traitées (compteur de l'en-tête) |
| PATCH | `/alerts/{id}` | changement de statut (`active` / `traitée`) |
| GET | `/models/metrics` | métriques réelles (`metrics.json`) — **réservé aux développeurs**, non affiché dans l'interface |
| GET | `/sensors` | intitulés et unités des capteurs |
| GET | `/dashboard` | statistiques du tableau de bord |
| POST | `/simulation/start` | démarrage (`machine_id`, `speed` en cycles/seconde) |
| POST | `/simulation/speed` | changement de vitesse pendant la simulation |
| POST | `/simulation/pause` · `/resume` · `/stop` | contrôle de la simulation |
| GET | `/simulation/status` | état de la simulation |

## 12. Communication entre Angular, FastAPI, les modèles IA et MongoDB

Exemple d'un cycle de simulation :

1. L'utilisateur clique sur **Démarrer** → Angular envoie `POST /simulation/start`.
2. FastAPI lance un **thread** (`simulation.py`) qui lit les vraies mesures NASA du moteur.
3. À chaque cycle, le thread :
   - construit les variables avec `features.py` (moyennes mobiles, variations) ;
   - normalise et prédit le **RUL** avec `rul_model.pkl` ;
   - calcule le **score d'anomalie** avec `anomaly_model.pkl` ;
   - calcule le **Health Score** et l'**état** ;
   - enregistre la mesure (`sensor_readings`), la prédiction (`predictions`), met à jour la machine (`machines`) et crée une alerte si nécessaire (`alerts`).
4. Angular appelle `GET /simulation/status` **toutes les secondes** et met à jour les indicateurs et les graphiques.

Les modèles sont chargés **une seule fois**, au démarrage du backend (`prediction.py`).

### Exemple de documents MongoDB
```json
// machines
{ "machine_id": "MOT-002", "name": "Moteur turbofan n°2", "state": "Normal",
  "current_rul": 113.4, "health_score": 93.5, "anomaly_score": 0.0,
  "current_cycle": 100, "total_cycles_available": 287, "last_update": "..." }

// predictions
{ "machine_id": "MOT-002", "cycle": 1, "predicted_rul": 127.1, "health_score": 87.6,
  "anomaly_score": 0.412, "is_anomaly": false, "state": "Normal", "created_at": "..." }
```

## 13. Vérifications manuelles

Vérifications réalisées pendant le développement (MongoDB 8.0, Python 3.13, Node 22, Chrome) :

- [x] Exécution complète des 6 notebooks, résultats et métriques cohérents.
- [x] Démarrage du backend : 20 machines, environ 2 900 mesures et estimations, alertes créées.
- [x] Swagger accessible ; `/predict`, `/detect-anomaly`, `/alerts`, `/alerts/count`, `/dashboard`, `/sensors`, `/models/metrics` testés.
- [x] Validation Pydantic : une mesure incomplète renvoie une erreur 422 explicite.
- [x] Priorités et recommandations : cohérentes avec les règles pour les 20 machines.
- [x] Machine non évaluée : affichée en gris, exclue du score moyen, jamais présentée comme saine.
- [x] Simulation : démarrage, changement de vitesse en cours de simulation (2 → 10 cycles/s), pause (le cycle n'avance plus), reprise et arrêt.
- [x] Alertes : pas de doublon quand une machine reste dans le même état ; « Marquer comme traitée » met à jour le compteur de l'en-tête (17 → 16).
- [x] Historique : filtre par date, par machine et par état ; export CSV (148 lignes pour une machine, accents lisibles dans Excel).
- [x] Angular : compilation sans erreur, 6 pages affichées (écran large et mobile), aucune erreur dans la console.

À refaire sur votre ordinateur : démarrer MongoDB, le backend et Angular, puis parcourir les 6 pages, lancer une simulation et vérifier les documents dans **MongoDB Compass**.

## 14. Limites du projet

- **Données simulées** : C-MAPSS est une simulation, avec une seule condition de vol et un seul mode de panne (FD001). Les résultats ne se transposent pas directement à de vraies machines.
- **Pas d'étiquettes d'anomalies** : la détection d'anomalies ne peut être évaluée que qualitativement.
- **Variable `cycle` très importante** : le modèle s'appuie en partie sur l'âge du moteur, ce qui pourrait moins bien se généraliser à des moteurs dont la durée de vie est très différente.
- **RUL plafonné à 125** : le modèle ne peut pas prédire un RUL supérieur à environ 125 cycles.
- **Début de vie bruité** : avec très peu de cycles d'historique, la moyenne mobile repose sur 1 à 9 mesures, ce qui rend le niveau d'anomalie moins fiable sur les tout premiers cycles.
- **Health Score** : pondérations (0,7 / 0,3) et seuils (70 / 30) choisis de façon pédagogique, pas calibrés sur des coûts réels de maintenance.
- **Règles de maintenance** : seuils (20 et 60 cycles) et recommandations génériques ; elles ne remplacent pas un plan de maintenance réel ni le diagnostic d'un technicien.
- **Simulation** : un seul moteur simulé à la fois ; l'état est gardé en mémoire (perdu si le serveur redémarre).
- **Explicabilité globale** uniquement : pas d'explication individuelle de chaque prédiction.

## 15. Perspectives d'amélioration

- Utiliser les sous-ensembles FD002 à FD004 (plusieurs conditions de vol et modes de panne).
- Optimiser les hyperparamètres par validation croisée groupée par moteur (`GroupKFold`).
- Ré-entraîner le modèle final sur les 100 moteurs après la sélection.
- Ajouter un intervalle de confiance sur le RUL (par exemple avec les quantiles du Gradient Boosting).
- Calibrer le Health Score avec des coûts de maintenance réels.
- Simuler plusieurs machines en parallèle et ajouter une authentification des utilisateurs.
- Connecter l'application à de vrais capteurs industriels.
