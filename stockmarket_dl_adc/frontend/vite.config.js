import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',   // bind all interfaces — required for Codespaces port forwarding
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Using 127.0.0.1 is more stable than 'localhost'
        changeOrigin: true,
        secure: false,
        ws: true,
        // Crucial for SSE:
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Disable buffering for the /analyze stream
            if (req.url.includes('/analyze')) {
              proxyRes.headers['cache-control'] = 'no-cache'
              proxyRes.headers['connection'] = 'keep-alive'
            }
          })
        },
      },
    },
  },
})

