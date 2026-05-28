import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleImage2ProxyRequest } from './dev/image2Proxy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      test: {
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
      },
      plugins: [
        {
          name: 'renderx-image2-dev-proxy',
          configureServer(server) {
            server.middlewares.use('/api/image2-edits', (request, response) => {
              void handleImage2ProxyRequest(request, response);
            });
          },
        },
        react(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
