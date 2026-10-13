/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // IPv4'e bağlanır (yalnızca IPv6 dinlemesi bazı tarayıcı/ağ ayarlarında boş sayfaya yol açabiliyor) ve tarayıcıyı doğru adreste açar.
  server: { host: '127.0.0.1', port: 5173, strictPort: true, open: '/' },
  preview: { host: '127.0.0.1' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    css: false,
  },
});
