import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { createBuildIdentity } from './tools/build-identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const buildIdentity = Object.freeze(createBuildIdentity(__dirname));

const buildIdentityPlugin = (): Plugin => ({
  name: 'ppaji-build-identity',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (pathname !== '/__ppaji_build') {
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
  define: {
    __PPAJI_BUILD__: JSON.stringify(buildIdentity),
  },
  server: {
    host: true, // 같은 네트워크의 폰에서 접속 가능하게
    port: 5173,
    strictPort: true,
    /*
     * 외부 호스트 접속 허용 (기본값은 localhost 만 허용한다).
     *
     * `.ts.net` 은 **테일스케일 MagicDNS** — 100.x 아이피로는 그냥 되지만 이름
     * (`macmini.tailXXXX.ts.net`)으로 들어오면 Vite 의 호스트 검사가 막는다.
     * 테일넷 안에서만 닿는 이름이라 여는 위험이 없다.
     */
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt', '.ts.net'],
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
