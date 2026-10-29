import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { rollupOptions: { input: ['popup.html', 'settings.html', 'dashboard.html'] } },
  plugins: [{
    name: 'extension-assets',
    closeBundle() {
      for (const asset of ['manifest.json', 'icon.png', '_locales']) {
        cpSync(asset, `dist/${asset}`, { recursive: true, filter: source => !source.endsWith(".DS_Store") });
      }
    },
  }],
});
