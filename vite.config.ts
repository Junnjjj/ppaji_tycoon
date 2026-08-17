import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  server: {
    host: true, // 같은 네트워크의 폰에서 접속 가능하게
    port: 5173,
    // Cloudflare 터널 등 외부 호스트 접속 허용 (기본값은 localhost 만 허용한다)
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
  },
  build: {
    // iOS Safari 16 대까지 안전하게 내려간다 (모바일이 최우선 목표)
    target: ['es2020', 'safari15'],
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        selftest: resolve(__dirname, 'selftest.html'),
      },
      output: {
        // Phaser는 크므로 별도 청크로 분리해 앱 코드 캐시 무효화와 분리한다
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
});
