import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server on :5173 (default). Talks cross-origin to the Nest API on :4000,
// which is why the server enables CORS. No proxy needed for the demo.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
