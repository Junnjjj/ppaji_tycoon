import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    // Cloudflare 터널(*.trycloudflare.com)에서 접속 가능하게 — 기본값은 localhost 만 허용한다
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
  },
});
