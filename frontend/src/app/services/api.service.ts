// ============================================================
// api.service.ts
// Service unique qui regroupe tous les appels HTTP vers FastAPI
// ============================================================

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Adresse du backend FastAPI
export const API_URL = 'http://localhost:8000';

// Message affiché quand le backend ne répond pas
export const SERVER_ERROR_MESSAGE =
  'Impossible de contacter le serveur de l\'application (' + API_URL + '). ' +
  'Vérifiez que MongoDB et le backend sont démarrés, puis actualisez la page.';

// ----- Structures des données renvoyées par l'API -----

export interface Machine {
  id: string;
  machine_id: string;
  name: string;
  state: string;                  // Normal | Avertissement | Critique | Non évaluée
  priority: string;               // Urgente | Élevée | Normale | Non évaluée
  recommendation: string;
  current_rul: number | null;     // durée de vie restante estimée (cycles)
  health_score: number | null;    // score de santé (0 à 100)
  anomaly_score: number | null;   // indicateur d'anomalie (0 à 1)
  is_anomaly: boolean;            // comportement inhabituel au dernier cycle
  unusual_sensors: string[];      // mesures les plus éloignées de l'habituel
  current_cycle: number;
  total_cycles_available: number;
  last_update: string;
}

export interface Prediction {
  id: string;
  machine_id: string;
  cycle: number;
  predicted_rul: number;
  health_score: number;
  anomaly_score: number;
  is_anomaly: boolean;
  state: string;
  priority: string;
  created_at: string;
}

export interface Alert {
  id: string;
  machine_id: string;
  machine_name: string;
  severity: string;
  cycle: number;
  estimated_rul: number;
  health_score: number;
  anomaly_score: number;
  description: string;
  recommendation: string;
  created_at: string;
  status: string;                 // active | traitée
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // ----- Machines -----
  getMachines(): Observable<Machine[]> {
    return this.http.get<Machine[]>(API_URL + '/machines');
  }

  getMachineDetails(machineId: string): Observable<any> {
    return this.http.get<any>(API_URL + '/machines/' + machineId);
  }

  // Intitulés compréhensibles et unités des capteurs
  getSensors(): Observable<any> {
    return this.http.get<any>(API_URL + '/sensors');
  }

  // ----- Tableau de bord -----
  getDashboard(): Observable<any> {
    return this.http.get<any>(API_URL + '/dashboard');
  }

  // ----- Historique des estimations -----
  getPredictions(machineId: string = ''): Observable<Prediction[]> {
    let url = API_URL + '/predictions?limit=10000';
    if (machineId !== '') {
      url = url + '&machine_id=' + machineId;
    }
    return this.http.get<Prediction[]>(url);
  }

  // ----- Alertes -----
  getAlerts(): Observable<Alert[]> {
    return this.http.get<Alert[]>(API_URL + '/alerts');
  }

  getActiveAlertCount(): Observable<any> {
    return this.http.get<any>(API_URL + '/alerts/count');
  }

  updateAlertStatus(alertId: string, status: string): Observable<Alert> {
    return this.http.patch<Alert>(API_URL + '/alerts/' + alertId, { status: status });
  }

  // ----- Simulation -----
  startSimulation(machineId: string, speed: number): Observable<any> {
    return this.http.post<any>(API_URL + '/simulation/start', { machine_id: machineId, speed: speed });
  }

  changeSimulationSpeed(speed: number): Observable<any> {
    return this.http.post<any>(API_URL + '/simulation/speed', { speed: speed });
  }

  pauseSimulation(): Observable<any> {
    return this.http.post<any>(API_URL + '/simulation/pause', {});
  }

  resumeSimulation(): Observable<any> {
    return this.http.post<any>(API_URL + '/simulation/resume', {});
  }

  stopSimulation(): Observable<any> {
    return this.http.post<any>(API_URL + '/simulation/stop', {});
  }

  getSimulationStatus(): Observable<any> {
    return this.http.get<any>(API_URL + '/simulation/status');
  }
}
