// Point d'entrée de l'application Angular
import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';

import { appConfig } from './app/app.config';
import { App } from './app/app';

// Formats français pour les dates et les nombres (ex : 61,5 et "mardi 24/11/2026")
registerLocaleData(localeFr);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
