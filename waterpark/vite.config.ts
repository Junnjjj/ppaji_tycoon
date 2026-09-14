import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { createBuildIdentity } from './tools/build-identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildIdentity = Object.freeze(createBuildIdentity(__dirname));

/** `/__wp_build` — 검증 도구가 "지금 뜬 서버가 이 소스인가"를 대조한다 (부모의 `__ppaji_build` 와 같은 형태) */
const buildIdentityPlugin = (): Plugin => ({
  name: 'wp-build-identity',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (pathname !== '/__wp_build') {
        next();
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(JSON.stringify(buildIdentity));
    });
  },
});

export default defineConfig({
  base: './',
  plugins: [buildIdentityPlugin()],
  define: { __WP_BUILD__: JSON.stringify(buildIdentity) },
  server: {
    host: true,
    // 부모 5173 · prototype-3d 5175 와 충돌하지 않는 자리
    port: 5177,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt', '.ts.net'],
  },
  build: {
    target: ['es2022', 'safari15'], // es2022: main.ts 의 top-level await (아틀라스 로드) — Safari 15 도 지원한다
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
});
