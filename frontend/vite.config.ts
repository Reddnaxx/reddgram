import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.0.102:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: 'http://192.168.0.102:3000',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://192.168.0.102:3000',
        changeOrigin: true,
      },
    },
  },
})
