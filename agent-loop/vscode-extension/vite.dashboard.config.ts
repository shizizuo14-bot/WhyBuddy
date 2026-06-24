import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const dashboardCssPath = path.resolve(__dirname, 'src/dashboard-react/dashboard-react.css');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'agent-loop-dashboard-css',
      generateBundle(_options, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type === 'chunk') {
            asset.code = asset.code.replace(/[ \t]+$/gm, '');
          }
        }
        this.emitFile({
          type: 'asset',
          fileName: 'dashboard.bundle.css',
          source: fs.readFileSync(dashboardCssPath, 'utf8'),
        });
      },
    },
  ],
  build: {
    emptyOutDir: false,
    outDir: 'media',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/dashboard-react/main.tsx'),
      output: {
        entryFileNames: 'dashboard.bundle.js',
        format: 'iife',
        name: 'AgentLoopDashboardBundle',
      },
    },
  },
});
