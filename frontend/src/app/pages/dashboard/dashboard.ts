// ============================================================
// Page 1 — Tableau de bord : vue globale du parc de machines
// ============================================================

import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Chart } from 'chart.js';

import { ApiService, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import { COLORS, createChart } from '../../services/chart-helpers';
import { getStateBadgeClass, getStateColor, HELP_TEXTS } from '../../services/display';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardPage implements OnInit, OnDestroy {
  dashboard: any = null;
  loading = true;
  errorMessage = '';

  // Graphiques Chart.js
  stateChart: Chart | null = null;
  healthChart: Chart | null = null;

  // Rafraîchissement automatique (toutes les 10 secondes)
  private timer: any;

  // Fonctions et textes utilisés dans le HTML
  getStateBadgeClass = getStateBadgeClass;
  helpTexts = HELP_TEXTS;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.timer = setInterval(() => this.loadDashboard(), 10000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.stateChart?.destroy();
    this.healthChart?.destroy();
  }

  loadDashboard(): void {
    this.api.getDashboard().subscribe({
      next: (data) => {
        this.dashboard = data;
        this.loading = false;
        this.errorMessage = '';
        // On attend que le HTML soit affiché avant de dessiner les graphiques
        setTimeout(() => this.drawCharts(), 0);
      },
      error: () => {
        this.loading = false;
        this.errorMessage = SERVER_ERROR_MESSAGE;
      },
    });
  }

  drawCharts(): void {
    const data = this.dashboard;

    // 1. Répartition des états (graphique circulaire)
    const labels = ['Normal', 'Avertissement', 'Critique'];
    const values = [data.normal_machines, data.warning_machines, data.critical_machines];
    const colors = [COLORS.green, COLORS.orange, COLORS.red];
    if (data.not_evaluated_machines > 0) {
      labels.push('Non évaluée');
      values.push(data.not_evaluated_machines);
      colors.push(COLORS.gray);
    }

    this.stateChart = createChart(this.stateChart, 'stateChart', {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: '#ffffff' }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        cutout: '68%',
        plugins: { legend: { position: 'bottom' } },
      },
    });

    // 2. Score de santé de chaque machine évaluée (barres colorées selon l'état)
    const machineIds: string[] = [];
    const healthScores: number[] = [];
    const barColors: string[] = [];
    for (const machine of data.machines) {
      if (machine.health_score !== null) {
        machineIds.push(machine.machine_id);
        healthScores.push(machine.health_score);
        barColors.push(getStateColor(machine.state));
      }
    }

    this.healthChart = createChart(this.healthChart, 'healthChart', {
      type: 'bar',
      data: {
        labels: machineIds,
        datasets: [{ label: 'Score de santé (/100)', data: healthScores, backgroundColor: barColors, borderRadius: 5 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 60, minRotation: 45, font: { size: 11 } } },
          y: { min: 0, max: 100, title: { display: true, text: 'Score de santé (/100)' } },
        },
      },
    });
  }
}
