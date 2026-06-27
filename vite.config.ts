import { defineConfig } from 'vite';

// Build-ID basert på byggetidspunkt (dato + klokkeslett). Beregnes når Vite
// starter (dev) eller bygger (prod), så hver build/omstart får en ny, økende
// verdi man kan sammenligne i spillet for å se om man kjører siste build.
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const BUILD_ID =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// Kinbound build-konfigurasjon.
// Primærplattform er mobil (Android/iOS via web), sekundær er PC i nettleser.
export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify(BUILD_ID),
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
