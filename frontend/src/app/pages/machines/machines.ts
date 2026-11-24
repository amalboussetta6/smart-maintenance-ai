// ============================================================
// Page 2 — Liste des machines (recherche + filtres)
// ============================================================

import { Component, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService, Machine, SERVER_ERROR_MESSAGE } from '../../services/api.service';
import {
  getAnomalyLevelLabel, getAnomalyPercent, getPriorityBadgeClass, getStateBadgeClass, getStateColor, HELP_TEXTS,
} from '../../services/display';

@Component({
  selector: 'app-machines',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, LowerCasePipe],
  templateUrl: './machines.html',
  styleUrl: './machines.css',
})
export class MachinesPage implements OnInit {
  machines: Machine[] = [];
  loading = true;
  errorMessage = '';

  // Valeurs de la barre de recherche et des filtres
  searchText = '';
  stateFilter = '';
  priorityFilter = '';

  // Fonctions et textes utilisés dans le HTML
  getStateBadgeClass = getStateBadgeClass;
  getStateColor = getStateColor;
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
      },
      error: () => {
        this.loading = false;
        this.errorMessage = SERVER_ERROR_MESSAGE;
      },
    });
  }

  // Liste filtrée affichée dans le tableau
  getFilteredMachines(): Machine[] {
    const search = this.searchText.toLowerCase();
    const result: Machine[] = [];

    for (const machine of this.machines) {
      const matchesSearch =
        machine.machine_id.toLowerCase().includes(search) || machine.name.toLowerCase().includes(search);
      const matchesState = this.stateFilter === '' || machine.state === this.stateFilter;
      const matchesPriority = this.priorityFilter === '' || machine.priority === this.priorityFilter;

      if (matchesSearch && matchesState && matchesPriority) {
        result.push(machine);
      }
    }
    return result;
  }

  resetFilters(): void {
    this.searchText = '';
    this.stateFilter = '';
    this.priorityFilter = '';
  }
}
