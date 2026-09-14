/**
 * P57-b(main 병합 M3) — 격자 북쪽 바깥의 풍경 띠 2장(먼 산 · 가까운 숲, main `kairo-environment-v1` 768px).
 * 그림 파일이지만 「뒤에 세운 벽」이 아니다 — 격자 줄(-36 · -26)에 24타일 폭으로 이어 붙여 같은 스케일 지형처럼 놓는다(main 의 `buildBackdrop` 과 같은 자리·같은 규칙).
 * `?legacy=0`·`?atlas=0`·`?scenery=0` 이면 안 읽는다(음성 대조군 — Surround 잔디만 남는다).
 */
export const LANDSCAPE_SLUGS = ['mountain_far', 'forest_near'] as const;
export type LandscapeSlug = (typeof LANDSCAPE_SLUGS)[number];
export type Landscape = Map<LandscapeSlug, HTMLImageElement>;

export function loadLandscape(base = './assets/landscape'): Promise<Landscape | null> {
  const q = new URLSearchParams(location.search);
  if (q.get('legacy') === '0' || q.get('atlas') === '0' || q.get('scenery') === '0') return Promise.resolve(null);
  return Promise.all(LANDSCAPE_SLUGS.map((slug) => new Promise<[LandscapeSlug, HTMLImageElement | null]>((resolve) => {
    const img = new Image();
    img.onload = () => resolve([slug, img]);
    img.onerror = () => resolve([slug, null]);
    img.src = `${base}/${slug}.png?v=1`;
  }))).then((rows) => {
    const m: Landscape = new Map();
    for (const [slug, img] of rows) if (img) m.set(slug, img);
    return m.size > 0 ? m : null;
  });
}
