# Données — NASA C-MAPSS (sous-ensemble FD001)

## Fichiers

| Fichier | Contenu |
|---|---|
| `train_FD001.txt` | 100 moteurs suivis jusqu'à la panne (20 631 cycles) |
| `test_FD001.txt` | 100 moteurs dont la série s'arrête avant la panne (13 096 cycles) |
| `RUL_FD001.txt` | durée de vie restante réelle des 100 moteurs de test |
| `processed/` | données préparées par le notebook `02_preprocessing.ipynb` (peuvent être recréées en relançant ce notebook) |

## Provenance

Jeu de données **simulé** publié par le *Prognostics Center of Excellence* de la NASA Ames
(dépôt de données de pronostic de la NASA). Page officielle :
https://data.nasa.gov/dataset/cmapss-jet-engine-simulated-data

Les fichiers de ce dossier sont identiques (sommes MD5 vérifiées) à ceux redistribués par deux dépôts
publics indépendants.

## Conditions d'utilisation

La page officielle indique un accès **public** mais **aucune licence explicite** (« License not specified »).
Le jeu de données est très largement utilisé et redistribué dans la recherche et l'enseignement.
Il est inclus ici à des fins pédagogiques, avec sa source. En cas de réutilisation, citer :

> A. Saxena, K. Goebel, D. Simon, N. Eklund, « Damage Propagation Modeling for Aircraft Engine
> Run-to-Failure Simulation », *Proceedings of the 1st International Conference on Prognostics and
> Health Management (PHM08)*, Denver, CO, 2008.
