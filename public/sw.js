/*
 * 서비스 워커 — 오프라인으로 돌리기 위한 최소 구성.
 *
 * ## 왜 직접 쓰나
 *
 * Workbox 를 붙이면 의존성과 빌드 단계가 늘어난다. 우리가 필요한 규칙은 셋뿐이라
 * 60줄이면 되고, 60줄은 읽어서 검증할 수 있다 (의존성 버전을 함부로 안 올린다는 결정과
 * 같은 방향이다).
 *
 * ## 규칙 셋
 *
 *   1. **해시가 붙은 자산**(`/assets/…-a1b2c3.js`)은 캐시 우선 — 내용이 바뀌면 이름이 바뀐다
 *
 * ⚠ **캐시 조회에 `ignoreVary: true` 가 필요하다.** 미리 담을 때(`cache.add`)와 모듈
 * 스크립트 요청의 `Accept-Encoding` 이 달라, 서버가 `Vary: Accept-Encoding` 을 주면
 * **Request 로는 안 맞고 문자열로는 맞는** 상태가 된다. 실측으로 오프라인에서 캐시에
 * 파일이 있는데도 `net::ERR_FAILED` 가 났다.
 *   2. **HTML 은 네트워크 우선** — 안 그러면 새 빌드가 영원히 안 보인다. 실패하면 캐시
 *   3. 나머지 같은 출처는 **캐시 먼저 주고 뒤에서 갱신** (stale-while-revalidate)
 *
 * ⚠ 캐시 이름에 버전을 박고 activate 에서 옛 캐시를 지운다. 안 지우면 사용자의 폰에
 * 옛 빌드가 계속 쌓인다.
 */
const VERSION = 'ppaji-v2';
const CACHE = `${VERSION}`;

/** 처음부터 있어야 하는 것 — 이게 없으면 오프라인 첫 화면이 안 뜬다 */
const CORE = ['./', './index.html', './manifest.webmanifest'];

/**
 * ⚠ **설치 시점에 빌드 산출물을 미리 담는다.**
 *
 * `fetch` 핸들러로만 캐시하면 **첫 방문에는 아무것도 안 담긴다** — 그때는 워커가 아직
 * 페이지를 제어하지 않아 요청이 워커를 안 거친다. 한 번 보고 닫았다가 오프라인으로
 * 돌아오면 흰 화면이다 (검증에서 실제로 실패했다).
 *
 * 목록(`precache.json`)은 빌드가 만든다 — 파일 이름에 해시가 붙어 미리 적어둘 수 없다.
 */
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      try {
        await c.addAll(CORE);
      } catch {
        /* 코어 하나가 없어도 설치는 계속한다 — 설치 실패는 곧 오프라인 불가다 */
      }
      try {
        const list = await (await fetch('./precache.json', { cache: 'no-cache' })).json();
        // 하나 실패해도 나머지는 담는다 — addAll 은 하나만 실패해도 전부 버린다
        await Promise.all(list.map((u) => c.add(u).catch(() => undefined)));
      } catch {
        /* 목록이 없으면(개발 빌드) 런타임 캐시로만 돈다 */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHashed = /\/assets\/.+\.[a-f0-9]{8,}\./.test(url.pathname);
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';

  if (isHashed) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreVary: true })
            .then((hit) => hit ?? caches.match('./index.html', { ignoreVary: true })),
        ),
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => hit);
      return hit ?? net;
    }),
  );
});
