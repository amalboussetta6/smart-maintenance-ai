// ============================================================
// Page 4 — Gestion des alertes
// ============================================================

import { Component, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Alert, ApiService, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import { getStateBadgeClass, HELP_TEXTS } from '../../services/display';

@Component({
  selector: 'app-alerts',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './alerts.html',
  styleUrl: './alerts.css',
})
export class AlertsPage implements OnInit {
  alerts: Alert[] = [];
  loading = true;
  errorMessage = '';

  searchText = '';
  severityFilter = '';
  statusFilter = 'active';

  getStateBadgeClass = getStateBadgeClass;
  helpTexts = HELP_TEXTS;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.api.getAlerts().subscribe({
      next: (data) => {
        this.alerts = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = SERVER_ERROR_MESSAGE;
      },
    });
  }

  // Liste filtrée selon la recherche, la gravité et le statut
  getFilteredAlerts(): Alert[] {
    const search = this.searchText.toLowerCase();
    const result: Alert[] = [];

    for (const alert of this.alerts) {
      const matchesSearch =
        alert.machine_id.toLowerCase().includes(search) ||
        alert.machine_name.toLowerCase().includes(search) ||
        alert.description.toLowerCase().includes(search);
      const matchesSeverity = this.severityFilter === '' || alert.severity === this.severityFilter;
      const matchesStatus = this.statusFilter === '' || alert.status === this.statusFilter;

      if (matchesSearch && matchesSeverity && matchesStatus) {
        result.push(alert);
      }
    }
    return result;
  }

  // Nombre d'alertes non traitées d'une gravité donnée ('' = toutes les gravités)
  countActiveAlerts(severity: string): number {
    let count = 0;
    for (const alert of this.alerts) {
      if (alert.status === 'active' && (severity === '' || alert.severity === severity)) {
        count = count + 1;
      }
    }
    return count;
  }

  // Nombre d'alertes déjà traitées
  countTreatedAlerts(): number {
    let count = 0;
    for (const alert of this.alerts) {
      if (alert.status === 'traitée') {
        count = count + 1;
      }
    }
    return count;
  }

  resetFilters(): void {
    this.searchText = '';
    this.severityFilter = '';
    this.statusFilter = '';
  }

  markAsTreated(alert: Alert): void {
    this.api.updateAlertStatus(alert.id, 'traitée').subscribe({
      next: (updatedAlert) => (alert.status = updatedAlert.status),
      error: () => (this.errorMessage = "Impossible de mettre à jour l'alerte."),
    });
  }
}
