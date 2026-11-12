import { defineConfig } from 'vite';

// The app's window: a small page served by Tauri (port 1420 in development).
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
