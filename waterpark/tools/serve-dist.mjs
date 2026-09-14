// dist/ 정적 서버 (임시 배포용) — 캐시 금지 헤더를 붙인다. 폰 브라우저가 옛 번들을 붙들고 있던 실측 때문에 python http.server 대신 쓴다.
//   node tools/serve-dist.mjs [port]   (기본 5178, 0.0.0.0)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 5178);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(root, path === '/' ? 'index.html' : path);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { res.writeHead(404); res.end('not found'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-length': body.length });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, '0.0.0.0', () => console.log(`dist → http://0.0.0.0:${port} (no-store)`));
