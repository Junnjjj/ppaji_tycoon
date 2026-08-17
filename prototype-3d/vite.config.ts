import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    // Cloudflare 터널(*.trycloudflare.com)에서 접속 가능하게 — 기본값은 localhost 만 허용한다
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
    // 상위 프로젝트의 src/sim 을 그대로 import 한다 (sim 복제 금지 — 같은 코드여야 의미가 있다)
    fs: { allow: ['..'] },
  },
});
