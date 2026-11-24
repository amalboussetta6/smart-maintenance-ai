// ============================================================
// app.ts — Composant principal : barre latérale + en-tête + page affichée
// ============================================================

import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ApiService } from './services/api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  // Titre de la page affichée dans l'en-tête
  pageTitle = 'Tableau de bord';

  // true si le serveur de l'application répond
  serverOnline = false;

  // Nombre d'alertes non traitées (affiché dans l'en-tête)
  activeAlertCount = 0;

  // Date et heure affichées dans l'en-tête
  now = new Date();

  // Liens de la barre latérale
  menuItems = [
    { path: '/', label: 'Tableau de bord', icon: 'bi-speedometer2' },
    { path: '/machines', label: 'Machines', icon: 'bi-gear-wide-connected' },
    { path: '/simulation', label: 'Simulation', icon: 'bi-play-circle' },
    { path: '/alertes', label: 'Alertes', icon: 'bi-bell' },
    { path: '/historique', label: 'Historique', icon: 'bi-clock-history' },
    { path: '/maintenance', label: 'Maintenance', icon: 'bi-tools' },
  ];

  private timer: any;

  constructor(private router: Router, private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    // Mise à jour du titre (et du compteur d'alertes) à chaque changement de page
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateTitle();
        this.refreshAlertCount();
      }
    });

    // Actualisation du compteur d'alertes toutes les 5 secondes
    this.refreshAlertCount();
    this.timer = setInterval(() => {
      this.now = new Date();
      this.refreshAlertCount();
    }, 5000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  updateTitle(): void {
    // On descend jusqu'à la route affichée pour lire son titre
    let currentRoute = this.route.firstChild;
    while (currentRoute !== null && currentRoute.firstChild !== null) {
      currentRoute = currentRoute.firstChild;
    }
    if (currentRoute !== null && currentRoute.snapshot.data['title']) {
      this.pageTitle = currentRoute.snapshot.data['title'];
    }
  }

  // Le compteur sert aussi à vérifier que le serveur répond
  refreshAlertCount(): void {
    this.api.getActiveAlertCount().subscribe({
      next: (data) => {
        this.activeAlertCount = data.active_alerts;
        this.serverOnline = true;
      },
      error: () => (this.serverOnline = false),
    });
  }
}
