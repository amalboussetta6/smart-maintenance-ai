// ============================================================
// Page 5 — Historique des estimations enregistrées dans MongoDB
// ============================================================

import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart } from 'chart.js';

import { ApiService, Machine, Prediction, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import { COLORS, createChart, lineDataset, lineOptions } from '../../services/chart-helpers';
import { getAnomalyPercent, getStateBadgeClass, HELP_TEXTS } from '../../services/display';

@Component({
  selector: 'app-history',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class HistoryPage implements OnInit, OnDestroy {
  predictions: Prediction[] = [];
  machines: Machine[] = [];
  loading = true;
  errorMessage = '';

  // Filtres
  machineFilter = '';
  stateFilter = '';
  dateFrom = '';        // format AAAA-MM-JJ (champ <input type="date">)
  dateTo = '';
  searchText = '';
  anomalyOnly = false;

  // Pagination simple (50 lignes par page)
  pageSize = 50;
  currentPage = 1;

  evolutionChart: Chart | null = null;

  getStateBadgeClass = getStateBadgeClass;
  getAnomalyPercent = getAnomalyPercent;
  helpTexts = HELP_TEXTS;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.evolutionChart?.destroy();
  }

  loadData(): void {
    this.loading = true;
    this.api.getMachines().subscribe((data) => (this.machines = data));

    this.api.getPredictions().subscribe({
      next: (data) => {
        this.predictions = data;
        this.loading = false;
        this.errorMessage = '';
        // Par défaut, le graphique montre la machine de l'estimation la plus récente
        if (this.machineFilter === '' && data.length > 0) {
          this.machineFilter = data[0].machine_id;
        }
        this.onFilterChange();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = SERVER_ERROR_MESSAGE;
      },
    });
  }

  // ----- Filtres -----
  getFilteredPredictions(): Prediction[] {
    const search = this.searchText.toLowerCase();
    const result: Prediction[] = [];

    for (const prediction of this.predictions) {
      // La date est au format "AAAA-MM-JJTHH:MM:SS" : ses 10 premiers caractères suffisent
      const day = prediction.created_at.substring(0, 10);

      const matchesMachine = this.machineFilter === '' || prediction.machine_id === this.machineFilter;
      const matchesState = this.stateFilter === '' || prediction.state === this.stateFilter;
      const matchesFrom = this.dateFrom === '' || day >= this.dateFrom;
      const matchesTo = this.dateTo === '' || day <= this.dateTo;
      const matchesSearch = prediction.machine_id.toLowerCase().includes(search);
      const matchesAnomaly = !this.anomalyOnly || prediction.is_anomaly;

      if (matchesMachine && matchesState && matchesFrom && matchesTo && matchesSearch && matchesAnomaly) {
        result.push(prediction);
      }
    }
    return result;
  }

  // Appelé à chaque changement de filtre
  onFilterChange(): void {
    this.currentPage = 1;
    setTimeout(() => this.drawChart(), 0);
  }

  resetFilters(): void {
    this.machineFilter = '';
    this.stateFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.searchText = '';
    this.anomalyOnly = false;
    this.onFilterChange();
  }

  // ----- Pagination -----
  getPageOfPredictions(): Prediction[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.getFilteredPredictions().slice(start, start + this.pageSize);
  }

  getNumberOfPages(): number {
    return Math.max(1, Math.ceil(this.getFilteredPredictions().length / this.pageSize));
  }

  changePage(step: number): void {
    const newPage = this.currentPage + step;
    if (newPage >= 1 && newPage <= this.getNumberOfPages()) {
      this.currentPage = newPage;
    }
  }

  // ----- Graphique d'évolution (une seule machine) -----
  drawChart(): void {
    if (this.machineFilter === '') {
      this.evolutionChart?.destroy();
      this.evolutionChart = null;
      return;
    }

    // Estimations filtrées, remises dans l'ordre des cycles
    const sorted = this.getFilteredPredictions().slice().sort((a, b) => a.cycle - b.cycle);

    const cycles: number[] = [];
    const ruls: number[] = [];
    const healthScores: number[] = [];
    for (const prediction of sorted) {
      cycles.push(prediction.cycle);
      ruls.push(prediction.predicted_rul);
      healthScores.push(prediction.health_score);
    }

    this.evolutionChart = createChart(this.evolutionChart, 'historyChart', {
      type: 'line',
      data: {
        labels: cycles,
        datasets: [
          lineDataset('Durée de vie restante estimée (cycles)', ruls, COLORS.navy),
          lineDataset('Score de santé (/100)', healthScores, COLORS.blue, true),
        ],
      },
      options: lineOptions('Valeur'),
    });
  }

  // ----- Export CSV des lignes filtrées -----
  exportCsv(): void {
    const rows: string[] = [];
    rows.push([
      'Machine', 'Date', 'Cycle', 'Durée de vie restante estimée (cycles)', 'Score de santé (/100)',
      "Indicateur d'anomalie (%)", 'Comportement inhabituel', 'État', 'Priorité',
    ].join(';'));

    for (const prediction of this.getFilteredPredictions()) {
      rows.push([
        prediction.machine_id,
        prediction.created_at.replace('T', ' ').substring(0, 19),
        prediction.cycle,
        String(prediction.predicted_rul).replace('.', ','),
        String(prediction.health_score).replace('.', ','),
        Math.round(prediction.anomaly_score * 100),
        prediction.is_anomaly ? 'Oui' : 'Non',
        prediction.state,
        prediction.priority || '',
      ].join(';'));
    }

    // "﻿" permet à Excel de reconnaître les accents (UTF-8)
    const content = '﻿' + rows.join('\r\n');
    const file = new Blob([content], { type: 'text/csv;charset=utf-8' });

    // Téléchargement du fichier grâce à un lien temporaire
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = 'historique_estimations.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
