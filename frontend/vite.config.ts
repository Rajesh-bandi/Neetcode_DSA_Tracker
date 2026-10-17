import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bind on all interfaces so the cloud preview can reach the dev server.
// The preview hostname is allowed per-process via
// __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS rather than hard-coded here.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      // The API lives in ../backend; proxying through the page origin keeps the
      // session cookie same-site in development.
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
});
