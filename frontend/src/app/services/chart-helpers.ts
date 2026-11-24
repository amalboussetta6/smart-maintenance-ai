// ============================================================
// chart-helpers.ts
// Petites fonctions communes pour Chart.js (couleurs, création de graphiques)
// Les couleurs et badges des états sont dans display.ts
// ============================================================

import { Chart, registerables } from 'chart.js';

// Enregistrement de tous les types de graphiques Chart.js (à faire une seule fois)
Chart.register(...registerables);

// Police et couleur par défaut des graphiques
Chart.defaults.font.family = 'Inter, "Segoe UI", sans-serif';
Chart.defaults.color = '#5b6b82';

// Palette de l'application
export const COLORS = {
  navy: '#0b1f3a',
  blue: '#1f6feb',
  lightBlue: '#4fa3ff',
  green: '#1e9e6a',
  orange: '#f08c00',
  red: '#e03131',
  gray: '#94a3b8',
};

// Crée un graphique sur un <canvas id="...">, en détruisant l'ancien s'il existe.
// Si le canvas n'existe plus (l'utilisateur a changé de page), on ne fait rien.
export function createChart(oldChart: Chart | null, canvasId: string, config: any): Chart | null {
  if (oldChart !== null) {
    oldChart.destroy();
  }
  const canvas = document.getElementById(canvasId);
  if (canvas === null) {
    return null;
  }
  return new Chart(canvasId, config);
}

// Configuration d'une courbe simple (ligne)
export function lineDataset(label: string, data: number[], color: string, fill: boolean = false): any {
  return {
    label: label,
    data: data,
    borderColor: color,
    backgroundColor: color + '22',
    fill: fill,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2,
  };
}

// Options communes des graphiques en ligne
export function lineOptions(yTitle: string, xTitle: string = 'Cycle'): any {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
    scales: {
      x: {
        title: { display: true, text: xTitle },
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
      },
      y: { title: { display: true, text: yTitle }, grid: { color: '#eef2f7' } },
    },
  };
}
