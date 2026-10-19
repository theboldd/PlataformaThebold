import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': `http://localhost:${process.env.BOLD_API_PORT || 4000}` } },
  build: { outDir: path.resolve(import.meta.dirname, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
