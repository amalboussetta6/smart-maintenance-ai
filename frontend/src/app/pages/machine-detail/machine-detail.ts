// ============================================================
// Détails d'une machine : état, durée de vie restante, capteurs, alertes
// ============================================================

import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chart } from 'chart.js';

import { ApiService, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import { COLORS, createChart, lineDataset, lineOptions } from '../../services/chart-helpers';
import {
  getAnomalyLevelLabel, getAnomalyPercent, getPriorityBadgeClass, getStateBadgeClass, HELP_TEXTS,
} from '../../services/display';

@Component({
  selector: 'app-machine-detail',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, LowerCasePipe],
  templateUrl: './machine-detail.html',
  styleUrl: './machine-detail.css',
})
export class MachineDetailPage implements OnInit, OnDestroy {
  machineId = '';
  details: any = null;
  loading = true;
  errorMessage = '';

  // Intitulés et unités des capteurs (reçus du backend)
  sensorInfo: any = {};
  sensorNames: string[] = [];
  selectedSensor = 'sensor_11';

  stateChart: Chart | null = null;
  rulChart: Chart | null = null;
  sensorChart: Chart | null = null;
  anomalyChart: Chart | null = null;

  // Fonctions et textes utilisés dans le HTML
  getStateBadgeClass = getStateBadgeClass;
  getPriorityBadgeClass = getPriorityBadgeClass;
  getAnomalyLevelLabel = getAnomalyLevelLabel;
  getAnomalyPercent = getAnomalyPercent;
  helpTexts = HELP_TEXTS;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    // Lecture de l'identifiant dans l'URL (/machines/MOT-002)
    this.machineId = this.route.snapshot.paramMap.get('id') || '';

    // 1. Intitulés des capteurs, puis 2. données de la machine
    this.api.getSensors().subscribe({
      next: (info) => {
        this.sensorInfo = info;
        this.sensorNames = Object.keys(info);
        this.loadDetails();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = SERVER_ERROR_MESSAGE;
      },
    });
  }

  ngOnDestroy(): void {
    this.stateChart?.destroy();
    this.rulChart?.destroy();
    this.sensorChart?.destroy();
    this.anomalyChart?.destroy();
  }

  loadDetails(): void {
    this.api.getMachineDetails(this.machineId).subscribe({
      next: (data) => {
        this.details = data;
        this.loading = false;
        setTimeout(() => this.drawCharts(), 0);
      },
      error: (error) => {
        this.loading = false;
        if (error.status === 404) {
          this.errorMessage = 'Machine introuvable : ' + this.machineId;
        } else {
          this.errorMessage = SERVER_ERROR_MESSAGE;
        }
      },
    });
  }

  // Intitulé complet d'un capteur, avec son unité si elle est connue
  getSensorTitle(sensor: string): string {
    const info = this.sensorInfo[sensor];
    if (!info) {
      return sensor;
    }
    if (info.unit === '') {
      return info.label + ' (sans unité)';
    }
    return info.label + ' (' + info.unit + ')';
  }

  // Nombre de cycles avec un comportement inhabituel parmi les 20 derniers
  countRecentUnusualCycles(): number {
    const predictions = this.details.predictions;
    let count = 0;
    const start = Math.max(0, predictions.length - 20);
    for (let index = start; index < predictions.length; index++) {
      if (predictions[index].is_anomaly) {
        count = count + 1;
      }
    }
    return count;
  }

  drawCharts(): void {
    if (this.details.predictions.length === 0) {
      return;
    }
    this.drawSensorChart();

    // Listes des cycles et des valeurs estimées
    const cycles: number[] = [];
    const ruls: number[] = [];
    const healthScores: number[] = [];
    const anomalyPercents: number[] = [];
    const normalLine: number[] = [];
    const criticalLine: number[] = [];
    for (const prediction of this.details.predictions) {
      cycles.push(prediction.cycle);
      ruls.push(prediction.predicted_rul);
      healthScores.push(prediction.health_score);
      anomalyPercents.push(Math.round(prediction.anomaly_score * 100));
      normalLine.push(70);
      criticalLine.push(30);
    }

    // 1. Évolution de l'état : score de santé + seuils des états
    const normalThreshold = lineDataset('Seuil « Normal » (70)', normalLine, COLORS.green);
    normalThreshold.borderDash = [6, 4];
    normalThreshold.borderWidth = 1.5;
    const criticalThreshold = lineDataset('Seuil « Critique » (30)', criticalLine, COLORS.red);
    criticalThreshold.borderDash = [6, 4];
    criticalThreshold.borderWidth = 1.5;

    const stateOptions = lineOptions('Score de santé (/100)');
    stateOptions.scales.y.min = 0;
    stateOptions.scales.y.max = 100;

    this.stateChart = createChart(this.stateChart, 'detailStateChart', {
      type: 'line',
      data: {
        labels: cycles,
        datasets: [lineDataset('Score de santé', healthScores, COLORS.blue, true), normalThreshold, criticalThreshold],
      },
      options: stateOptions,
    });

    // 2. Durée de vie restante estimée
    this.rulChart = createChart(this.rulChart, 'detailRulChart', {
      type: 'line',
      data: { labels: cycles, datasets: [lineDataset('Durée de vie restante estimée', ruls, COLORS.navy, true)] },
      options: lineOptions('Cycles restants (estimation)'),
    });

    // 3. Indicateur d'anomalie (en %)
    const anomalyOptions = lineOptions("Indicateur d'anomalie (%)");
    anomalyOptions.scales.y.min = 0;
    anomalyOptions.scales.y.max = 100;
    this.anomalyChart = createChart(this.anomalyChart, 'detailAnomalyChart', {
      type: 'line',
      data: { labels: cycles, datasets: [lineDataset("Indicateur d'anomalie", anomalyPercents, COLORS.orange, true)] },
      options: anomalyOptions,
    });
  }

  // Redessine le graphique du capteur sélectionné
  drawSensorChart(): void {
    const cycles: number[] = [];
    const values: number[] = [];
    for (const reading of this.details.sensor_readings) {
      cycles.push(reading.cycle);
      values.push(reading.sensors[this.selectedSensor]);
    }

    const unit = this.sensorInfo[this.selectedSensor].unit;
    let axisTitle = 'Valeur mesurée';
    if (unit !== '') {
      axisTitle = 'Valeur mesurée (' + unit + ')';
    }

    this.sensorChart = createChart(this.sensorChart, 'detailSensorChart', {
      type: 'line',
      data: {
        labels: cycles,
        datasets: [lineDataset(this.sensorInfo[this.selectedSensor].label, values, COLORS.lightBlue)],
      },
      options: lineOptions(axisTitle),
    });
  }

  // Les 50 estimations les plus récentes (pour le tableau)
  getLatestPredictions(): any[] {
    return this.details.predictions.slice().reverse().slice(0, 50);
  }
}
