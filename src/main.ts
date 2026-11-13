import { initI18n } from './app/core/i18n/i18n';

// The language comes first: it is read (and the Arabic dictionary fetched when
// needed) before any other file of the app runs. See app/core/i18n/i18n.ts.
initI18n()
  .catch(() => { /* English, the default, needs nothing loaded */ })
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
