// ============================================================
// Page 6 — Maintenance : machines classées par priorité d'intervention
// Les priorités et recommandations sont calculées par le backend
// (règles simples, voir backend/prediction.py).
// ============================================================

import { Component, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, LowerCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ApiService, Machine, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import {
  getAnomalyLevelLabel, getAnomalyPercent, getPriorityBadgeClass, getStateBadgeClass, HELP_TEXTS,
} from '../../services/display';

@Component({
  selector: 'app-maintenance',
  imports: [RouterLink, DatePipe, DecimalPipe, LowerCasePipe],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.css',
})
export class MaintenancePage implements OnInit {
  machines: Machine[] = [];
  loading = true;
  errorMessage = '';
  lastRefresh: Date | null = null;

  // Ordre d'affichage des priorités
  priorityOrder = ['Urgente', 'Élevée', 'Normale', 'Non évaluée'];

  // Priorité sélectionnée dans les onglets ('' = toutes)
  selectedPriority = '';

  getStateBadgeClass = getStateBadgeClass;
  getPriorityBadgeClass = getPriorityBadgeClass;
  getAnomalyLevelLabel = getAnomalyLevelLabel;
  getAnomalyPercent = getAnomalyPercent;
  helpTexts = HELP_TEXTS;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadMachines();
  }

  loadMachines(): void {
    this.loading = true;
    this.api.getMachines().subscribe({
      next: (data) => {
        this.machines = data;
        this.loading = false;
        this.errorMessage = '';
        this.lastRefresh = new Date();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = SERVER_ERROR_MESSAGE;
      },
    });
  }

  // Machines d'une priorité donnée, les plus dégradées en premier
  getMachinesByPriority(priority: string): Machine[] {
    const result: Machine[] = [];
    for (const machine of this.machines) {
      if (machine.priority === priority) {
        result.push(machine);
      }
    }
    result.sort((a, b) => (a.health_score ?? 0) - (b.health_score ?? 0));
    return result;
  }

  // Priorités affichées selon l'onglet choisi
  getVisiblePriorities(): string[] {
    if (this.selectedPriority === '') {
      return this.priorityOrder;
    }
    return [this.selectedPriority];
  }

  selectPriority(priority: string): void {
    this.selectedPriority = priority;
  }

  // Titre de chaque groupe de priorité
  getGroupTitle(priority: string): string {
    if (priority === 'Urgente') {
      return 'Priorité urgente — intervention à organiser au plus vite';
    }
    if (priority === 'Élevée') {
      return 'Priorité élevée — inspection ou surveillance renforcée à planifier';
    }
    if (priority === 'Normale') {
      return 'Priorité normale — surveillance habituelle';
    }
    return 'Machines non évaluées — aucune estimation disponible';
  }

  printPlan(): void {
    window.print();
  }
}
