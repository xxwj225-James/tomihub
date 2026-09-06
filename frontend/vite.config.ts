import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [react(), {
    name: 'serve-mockup',
    configureServer(server) {
      server.middlewares.use('/mockup/', (req, res, next) => {
        const filePath = path.resolve(__dirname, './mockup', req.url!.replace('/mockup/', ''));
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html');
          res.end(fs.readFileSync(filePath));
        } else {
          next();
        }
      });
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',  // allow Docker Nginx to reach Vite
    proxy: {
      '/api/v1/auth': 'http://localhost:8081',
      '/api/v1/admin': 'http://localhost:8081',
      '/api/v1/mcp-audit': 'http://localhost:8082',  // DB-backed audit, direct to Core
      '/api/v1/ai': 'http://localhost:8000',           // AI assistant, SSE streaming
      '/api/v1/mcp': {
        target: 'http://localhost:8000',
        proxyTimeout: 360_000,  // HITL sync blocking (5 min)
      },
      '/api': 'http://localhost:8082',
    },
  },
  build: {
    modulePreload: false,  // disable polyfill — avoids Chrome preload warnings for lazy chunks
  },
});
