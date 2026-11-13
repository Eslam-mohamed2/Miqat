import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Loaded by main.ts once the interface language is known, so every file of the
// app can call t() from the first line it runs.
bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
