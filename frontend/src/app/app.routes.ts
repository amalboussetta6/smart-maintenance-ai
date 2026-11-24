// Définition des pages de l'application (routing classique)
import { Routes } from '@angular/router';

import { DashboardPage } from './pages/dashboard/dashboard';
import { MachinesPage } from './pages/machines/machines';
import { MachineDetailPage } from './pages/machine-detail/machine-detail';
import { SimulationPage } from './pages/simulation/simulation';
import { AlertsPage } from './pages/alerts/alerts';
import { HistoryPage } from './pages/history/history';
import { MaintenancePage } from './pages/maintenance/maintenance';

export const routes: Routes = [
  { path: '', component: DashboardPage, data: { title: 'Tableau de bord' } },
  { path: 'machines', component: MachinesPage, data: { title: 'Machines' } },
  { path: 'machines/:id', component: MachineDetailPage, data: { title: 'Détails de la machine' } },
  { path: 'simulation', component: SimulationPage, data: { title: 'Simulation' } },
  { path: 'alertes', component: AlertsPage, data: { title: 'Alertes' } },
  { path: 'historique', component: HistoryPage, data: { title: 'Historique des estimations' } },
  { path: 'maintenance', component: MaintenancePage, data: { title: 'Planification de la maintenance' } },
  { path: '**', redirectTo: '' },
];
