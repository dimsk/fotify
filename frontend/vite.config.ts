import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 15766,
    proxy: {
      '/sources': 'http://localhost:15765',
      '/photos': 'http://localhost:15765',
      '/settings': 'http://localhost:15765',
      '/calendar': 'http://localhost:15765',
      '/weather': 'http://localhost:15765',
    },
  },
});
