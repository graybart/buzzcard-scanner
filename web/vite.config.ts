import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// One HTML entry per page. The Node server (../server.js) serves dist/ and handles auth + API.
const pages = ['scanner', 'admin', 'login', 'count', 'checkout', 'fastpass'];

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: Object.fromEntries(pages.map(p => [p, resolve(import.meta.dirname, `${p}.html`)])) },
  },
  // `npm run dev`: run the server on :8080 (PUBLIC_DIR=web/dist node server.js) and open /admin.html etc.
  server: {
    proxy: Object.fromEntries(['/api', '/login', '/logout'].map(p => [p, { target: 'http://localhost:8080', changeOrigin: true }])),
  },
});
