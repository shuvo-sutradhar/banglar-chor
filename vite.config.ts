import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    // The physics chunk is large because @dimforge/rapier3d-compat inlines its WASM
    // (~1.1 MB gzipped). It is split out so app code caches independently (docs/DECISIONS.md D-004).
    chunkSizeWarningLimit: 3300,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@dimforge') || id.includes('@react-three/rapier')) return 'physics';
          return undefined;
        },
      },
    },
  },
});
