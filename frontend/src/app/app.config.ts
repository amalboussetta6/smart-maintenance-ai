// Configuration globale de l'application Angular
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Permet d'utiliser HttpClient pour appeler l'API FastAPI
    provideHttpClient(),
    // Langue française pour l'affichage des dates et des nombres
    { provide: LOCALE_ID, useValue: 'fr' },
  ],
};
