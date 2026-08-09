/**
 * Dev-server API proxy. Only `ng serve` reads this — production builds call the
 * absolute URL in src/environments/environment.ts, so changing the target here
 * never affects the deployed app.
 *
 * Defaults to the local docker-compose backend (Back-End/Miqat.Api).
 * To point at the deployed Azure API instead:
 *
 *   MIQAT_API=azure npm start
 */
const AZURE = 'https://miqatsmartcalendar-b7e4anhxh8d5cmcx.israelcentral-01.azurewebsites.net';
const LOCAL = 'http://localhost:10000';

const useAzure = process.env['MIQAT_API'] === 'azure';
const target = useAzure ? AZURE : LOCAL;

console.log(`[proxy] /api -> ${target}`);

module.exports = {
  '/api': {
    target,
    // The local API is plain HTTP, so certificate checking must be off for it.
    secure: useAzure,
    changeOrigin: true,
    logLevel: 'debug',
  },
  // SignalR: ws upgrade must be forwarded or the client silently falls back to
  // long-polling against the wrong origin.
  '/hubs': {
    target,
    secure: useAzure,
    changeOrigin: true,
    ws: true,
  },
};
