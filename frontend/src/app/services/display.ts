// ============================================================
// display.ts
// Petites fonctions d'affichage : couleurs, badges et textes compréhensibles
// ============================================================

import { COLORS } from './chart-helpers';

// État d'une machine sans aucune estimation disponible
export const NOT_EVALUATED = 'Non évaluée';

// Couleur associée à chaque état de machine
export function getStateColor(state: string): string {
  if (state === 'Normal') {
    return COLORS.green;
  }
  if (state === 'Avertissement') {
    return COLORS.orange;
  }
  if (state === 'Critique') {
    return COLORS.red;
  }
  return COLORS.gray;
}

// Classe CSS du badge d'un état (voir styles.css)
export function getStateBadgeClass(state: string): string {
  if (state === 'Normal') {
    return 'badge badge-normal';
  }
  if (state === 'Avertissement') {
    return 'badge badge-warning';
  }
  if (state === 'Critique') {
    return 'badge badge-critical';
  }
  return 'badge badge-gray';
}

// Classe CSS du badge d'une priorité d'intervention
export function getPriorityBadgeClass(priority: string): string {
  if (priority === 'Urgente') {
    return 'badge badge-critical';
  }
  if (priority === 'Élevée') {
    return 'badge badge-warning';
  }
  if (priority === 'Normale') {
    return 'badge badge-normal';
  }
  return 'badge badge-gray';
}

// Indicateur d'anomalie (0 à 1) traduit en mots
export function getAnomalyLevelLabel(anomalyScore: number | null): string {
  if (anomalyScore === null || anomalyScore === undefined) {
    return 'Non disponible';
  }
  if (anomalyScore < 0.3) {
    return 'Faible';
  }
  if (anomalyScore < 0.6) {
    return 'Modéré';
  }
  return 'Élevé';
}

// Indicateur d'anomalie exprimé en pourcentage (texte)
export function getAnomalyPercent(anomalyScore: number | null): string {
  if (anomalyScore === null || anomalyScore === undefined) {
    return '—';
  }
  return Math.round(anomalyScore * 100) + ' %';
}

// Textes des infobulles, réutilisés sur plusieurs pages
export const HELP_TEXTS = {
  rul:
    'Nombre estimé de cycles de fonctionnement avant une panne probable. ' +
    'Un cycle correspond à une utilisation complète du moteur (un vol).',
  health:
    'Score de 0 à 100 qui résume l\'état de la machine. 70 et plus : normal ; ' +
    'de 30 à 70 : avertissement ; moins de 30 : critique.',
  anomaly:
    'Indique à quel point les mesures s\'éloignent du fonctionnement habituel d\'une machine en bon état ' +
    '(0 % = comportement habituel, 100 % = comportement observé juste avant une panne).',
  priority:
    'Urgente : machine critique. Élevée : machine en avertissement. Normale : aucun signe préoccupant.',
  estimate:
    'Les résultats sont des estimations calculées automatiquement à partir des mesures des capteurs. ' +
    'Ils aident à la décision mais ne remplacent pas l\'avis d\'un technicien.',
};
