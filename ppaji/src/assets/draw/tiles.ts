/**
 * 지형 타일 — 정수 스캔라인 마스크로 굽는다 (`tileRowSpan`). `fill()` 을 쓰면 경계가
 * 안티에일리어싱되어 타일 사이에 1px 이음새가 보인다.
 *
 * 색은 CSS 토큰(`--tile-*`)에서 읽는다 — TS 에 hex 를 두지 않는다 (정적 게이트가 지킨다).
 */
import { TILE_W, TILE_H, tileRowSpan } from '../../render/iso.js';
import { cssVar } from '../../ui/tokens.js';

export type TileId = 'sand' | 'grass' | 'path' | 'indoor' | 'pool' | 'gate' | 'river' | 'shallow' | 'deck' | 'road' | 'rock' | 'hall';

/** 결정론적 점 — 좌표 해시. Math.random 을 쓰면 굽을 때마다 무늬가 달라져 스크린샷 대조가 깨진다 */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 물결 프레임 수 — 씬이 `tile/pool:0..N-1` 을 돌려 가며 붙인다 (G18) */
export const WATER_FRAMES = 3;

export function drawTile(kindId: string): HTMLCanvasElement {
  const [kind0, frameStr] = kindId.split(':') as [TileId, string | undefined];
  const kind = kind0;
  const frame = Number(frameStr ?? 0) || 0;
  const c = document.createElement('canvas');
  c.width = TILE_W;
  c.height = TILE_H;
  const g = c.getContext('2d');
  if (!g) return c;
  const base = cssVar(`--tile-${kind}`);
  const dot = cssVar(`--tile-${kind}-dot`);
  // 모래·풀은 경계선을 거의 안 그린다 — 넓은 면에 격자가 그물처럼 보인다 (G14 실측)
  const edge = cssVar(kind === 'sand' || kind === 'pool' || kind === 'river' || kind === 'shallow' || kind === 'road' ? '--tile-edge-soft' : '--tile-edge');
  for (let y = 0; y < TILE_H; y++) {
    const s = tileRowSpan(y);
    g.fillStyle = base;
    g.fillRect(s.x0, y, s.x1 - s.x0, 1);
    // 결 — 종류마다 무늬가 다르다 (G14: 잔디는 풀포기 V, 모래는 밝은 알갱이, 포장은 돌 이음, 실내는 널판)
    for (let x = s.x0; x < s.x1; x++) {
      const r = hash(x, y, kind.length);
      let want: string | null = null;
      if (kind === 'grass') {
        // 풀포기 — 2텍셀 간격 격자 위의 확률 점 + 그 위 한 칸 밝은 점
        // 카이로 잔디는 거의 평면이다 — 풀포기는 드문드문 (실측: 촘촘하면 S2 에서 노이즈로 보인다)
        if ((x + y * 3) % 7 === 0 && r < 0.22) want = dot;
        else if ((x + 3 + y * 3) % 7 === 0 && hash(x, y + 1, 7) < 0.22) want = cssVar('--tile-grass-lt');
      } else if (kind === 'sand') {
        want = r < 0.05 ? dot : r > 0.93 ? cssVar('--tile-sand-lt') : null;
      } else if (kind === 'path' || kind === 'hall') {
        const cell = ((x >> 3) + (y >> 2)) % 2 === 0;
        want = (x % 8 === 0 || y % 4 === 0) ? dot : cell && r < 0.08 ? cssVar('--tile-path-lt') : null;
      } else if (kind === 'indoor') {
        want = y % 4 === 0 || (x + (y >> 2) * 5) % 12 === 0 ? dot : null;
      } else if (kind === 'pool') {
        // PSS 물 = 다이아몬드 반짝 무늬 (실측 R6): 8×4 다이아 격자의 밝은 변 + 프레임마다 위치가 도는 흰 점
        const dx = ((x + frame * 3) % 8); const dy = y % 4;
        const onDiamond = Math.abs(dx - 4) + Math.abs(dy - 2) * 2 === 4;
        const glint = hash((x + frame * 5) >> 2, y >> 1, 11) < 0.06;
        want = onDiamond && hash(x >> 3, y >> 2, 9) < 0.55 ? cssVar('--tile-pool-diamond') : glint ? dot : null;
      } else if (kind === 'river') {
        // 강 (P0) — 풀보다 짙은 물빛 + 흐름 줄(프레임마다 오른쪽으로 밀리는 밝은 획) + 드문 반짝
        const flow = ((x - frame * 4 + y * 2) % 16 + 16) % 16 < 3 && y % 3 === 1 && hash(x >> 4, y, 13) < 0.7;
        const glint = hash((x + frame * 5) >> 2, y >> 1, 11) < 0.03;
        want = flow ? cssVar('--tile-river-diamond') : glint ? dot : null;
      } else if (kind === 'shallow') {
        // 여울 — 모래빛 바닥 위 옅은 물 · 물가 거품 점
        want = r < 0.06 ? dot : hash(x >> 2, y, 17) < 0.12 ? cssVar('--tile-shallow-lt') : null;
      } else if (kind === 'rock') {
        // 암반 (P44 절벽 테두리) — 회색 바탕에 거친 결
        want = r < 0.12 ? dot : hash(x >> 1, y, 19) < 0.08 ? cssVar('--tile-rock-lt') : null;
      } else if (kind === 'road') {
        // 차도 (P43 도시 띠) — 아스팔트 알갱이 + 드문 밝은 점. 차선은 없다(두 줄이라 버스가 그 위에 선다)
        want = r < 0.06 ? dot : r > 0.97 ? cssVar('--tile-road-lt') : null;
      } else if (kind === 'deck') {
        // 데크 — 널판 결 (실내 널판보다 굵고 어둡다)
        want = y % 5 === 0 || (x + (y / 5 | 0) * 7) % 14 === 0 ? dot : r < 0.04 ? cssVar('--tile-deck-lt') : null;
      }
      if (want) {
        g.fillStyle = want;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  // 아래 두 변에만 어두운 1px — 한 경계를 이웃 둘이 나눠 가지므로 네 변에 다 그리면 겹친다
  g.fillStyle = edge;
  for (let y = TILE_H / 2; y < TILE_H; y++) {
    const s = tileRowSpan(y);
    g.fillRect(s.x0, y, 1, 1);
    g.fillRect(s.x1 - 1, y, 1, 1);
  }
  if (kind === 'gate') {
    // 입구 표식 — 흰 화살표 한 개 (아래에서 위로)
    g.fillStyle = cssVar('--tile-gate-mark');
    g.fillRect(15, 4, 2, 8);
    g.fillRect(13, 6, 6, 1);
    g.fillRect(14, 5, 4, 1);
  }
  return c;
}
