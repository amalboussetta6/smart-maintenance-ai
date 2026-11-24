// ============================================================
// Page 3 — Simulation de la dégradation d'une machine
// Les données historiques NASA sont rejouées cycle par cycle par le backend.
// Angular interroge GET /simulation/status chaque seconde (pas de WebSocket).
// ============================================================

import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart } from 'chart.js';

import { ApiService, Machine, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import { COLORS, createChart, lineDataset, lineOptions } from '../../services/chart-helpers';
import {
  getAnomalyLevelLabel, getAnomalyPercent, getPriorityBadgeClass, getStateBadgeClass, getStateColor, HELP_TEXTS,
} from '../../services/display';

@Component({
  selector: 'app-simulation',
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './simulation.html',
  styleUrl: './simulation.css',
})
export class SimulationPage implements OnInit, OnDestroy {
  machines: Machine[] = [];
  selectedMachineId = '';
  speed = 2;
  speedOptions = [1, 2, 5, 10];

  // Intitulés et unités des capteurs, capteur affiché dans le graphique
  sensorInfo: any = {};
  sensorNames: string[] = [];
  selectedSensor = 'sensor_11';

  // Dernier état reçu du backend
  status: any = null;
  errorMessage = '';

  indicatorsChart: Chart | null = null;
  anomalyChart: Chart | null = null;
  sensorChart: Chart | null = null;

  private timer: any;

  // Fonctions et textes utilisés dans le HTML
  getStateBadgeClass = getStateBadgeClass;
  getPriorityBadgeClass = getPriorityBadgeClass;
  getStateColor = getStateColor;
  getAnomalyLevelLabel = getAnomalyLevelLabel;
  getAnomalyPercent = getAnomalyPercent;
  helpTexts = HELP_TEXTS;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getMachines().subscribe({
      next: (data) => {
        this.machines = data;
        if (data.length > 0 && this.selectedMachineId === '') {
          this.selectedMachineId = data[0].machine_id;
        }
      },
      error: () => (this.errorMessage = SERVER_ERROR_MESSAGE),
    });

    this.api.getSensors().subscribe((info) => {
      this.sensorInfo = info;
      this.sensorNames = Object.keys(info);
    });

    this.createCharts();

    // Interrogation périodique de l'état de la simulation (toutes les secondes)
    this.refreshStatus();
    this.timer = setInterval(() => this.refreshStatus(), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.indicatorsChart?.destroy();
    this.anomalyChart?.destroy();
    this.sensorChart?.destroy();
  }

  // ----- Boutons de contrôle -----
  start(): void {
    this.api.startSimulation(this.selectedMachineId, this.speed).subscribe({
      next: (data) => this.applyStatus(data),
      error: () => (this.errorMessage = SERVER_ERROR_MESSAGE),
    });
  }

  pause(): void {
    this.api.pauseSimulation().subscribe((data) => this.applyStatus(data));
  }

  resume(): void {
    this.api.resumeSimulation().subscribe((data) => this.applyStatus(data));
  }

  stop(): void {
    this.api.stopSimulation().subscribe((data) => this.applyStatus(data));
  }

  // La vitesse peut être modifiée pendant la simulation
  onSpeedChange(): void {
    if (this.isRunning() || this.isPaused()) {
      this.api.changeSimulationSpeed(this.speed).subscribe((data) => this.applyStatus(data));
    }
  }

  refreshStatus(): void {
    this.api.getSimulationStatus().subscribe({
      next: (data) => this.applyStatus(data),
      error: () => (this.errorMessage = SERVER_ERROR_MESSAGE),
    });
  }

  applyStatus(data: any): void {
    this.status = data;
    this.errorMessage = '';
    // Pendant une simulation, la machine et la vitesse affichées sont celles du serveur
    if (data.machine_id && (data.status === 'running' || data.status === 'paused')) {
      this.selectedMachineId = data.machine_id;
      this.speed = data.speed;
    }
    this.updateCharts();
  }

  // ----- Textes et valeurs affichés -----
  isRunning(): boolean {
    return this.status !== null && this.status.status === 'running';
  }

  isPaused(): boolean {
    return this.status !== null && this.status.status === 'paused';
  }

  getStatusLabel(): string {
    if (this.status === null) {
      return 'Chargement...';
    }
    const labels: any = {
      running: 'En cours',
      paused: 'En pause',
      stopped: 'Arrêtée',
      finished: 'Terminée (fin des données disponibles)',
    };
    return labels[this.status.status];
  }

  getMachineName(machineId: string): string {
    for (const machine of this.machines) {
      if (machine.machine_id === machineId) {
        return machine.name;
      }
    }
    return machineId;
  }

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

  // Valeurs des capteurs au dernier cycle (pour la grille de valeurs)
  getSensorList(): any[] {
    const list: any[] = [];
    if (this.status === null || this.status.last_sensors === null) {
      return list;
    }
    for (const name of Object.keys(this.status.last_sensors)) {
      const info = this.sensorInfo[name];
      list.push({
        label: info ? info.label : name,
        unit: info ? info.unit : '',
        value: this.status.last_sensors[name],
      });
    }
    return list;
  }

  // Nombre de cycles avec un comportement inhabituel depuis le début de la simulation
  countUnusualCycles(): number {
    let count = 0;
    if (this.status === null) {
      return count;
    }
    for (const point of this.status.history) {
      if (point.is_anomaly) {
        count = count + 1;
      }
    }
    return count;
  }

  // ----- Graphiques dynamiques -----
  createCharts(): void {
    // Durée de vie restante et score de santé sur le même graphique
    this.indicatorsChart = createChart(this.indicatorsChart, 'simIndicatorsChart', {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          lineDataset('Durée de vie restante estimée (cycles)', [], COLORS.navy),
          lineDataset('Score de santé (/100)', [], COLORS.blue),
        ],
      },
      options: lineOptions('Valeur'),
    });

    // Indicateur d'anomalie en % : axe vertical fixé entre 0 et 100
    const anomalyOptions = lineOptions("Indicateur d'anomalie (%)");
    anomalyOptions.scales.y.min = 0;
    anomalyOptions.scales.y.max = 100;
    this.anomalyChart = createChart(this.anomalyChart, 'simAnomalyChart', {
      type: 'line',
      data: { labels: [], datasets: [lineDataset("Indicateur d'anomalie", [], COLORS.orange, true)] },
      options: anomalyOptions,
    });

    this.sensorChart = createChart(this.sensorChart, 'simSensorChart', {
      type: 'line',
      data: { labels: [], datasets: [lineDataset('Mesure', [], COLORS.lightBlue)] },
      options: lineOptions('Valeur mesurée'),
    });
  }

  updateCharts(): void {
    if (this.status === null) {
      return;
    }
    if (this.indicatorsChart === null || this.anomalyChart === null || this.sensorChart === null) {
      return;
    }

    const cycles: number[] = [];
    const ruls: number[] = [];
    const healthScores: number[] = [];
    const anomalyPercents: number[] = [];
    const sensorValues: number[] = [];

    for (const point of this.status.history) {
      cycles.push(point.cycle);
      ruls.push(point.predicted_rul);
      healthScores.push(point.health_score);
      anomalyPercents.push(Math.round(point.anomaly_score * 100));
      sensorValues.push(point.sensors[this.selectedSensor]);
    }

    // On remplace les données puis on redessine sans animation
    this.indicatorsChart.data.labels = cycles;
    this.indicatorsChart.data.datasets[0].data = ruls;
    this.indicatorsChart.data.datasets[1].data = healthScores;
    this.indicatorsChart.update('none');

    this.anomalyChart.data.labels = cycles;
    this.anomalyChart.data.datasets[0].data = anomalyPercents;
    this.anomalyChart.update('none');

    // Graphique du capteur choisi, avec son intitulé et son unité
    // Axe vertical : uniquement l'unité (le nom complet est dans la légende)
    const sensorOptions: any = this.sensorChart.options;
    const info = this.sensorInfo[this.selectedSensor];
    if (info && info.unit !== '') {
      sensorOptions.scales.y.title.text = 'Valeur mesurée (' + info.unit + ')';
    } else {
      sensorOptions.scales.y.title.text = 'Valeur mesurée (sans unité)';
    }
    this.sensorChart.data.labels = cycles;
    this.sensorChart.data.datasets[0].label = this.getSensorTitle(this.selectedSensor);
    this.sensorChart.data.datasets[0].data = sensorValues;
    this.sensorChart.update('none');
  }
}
