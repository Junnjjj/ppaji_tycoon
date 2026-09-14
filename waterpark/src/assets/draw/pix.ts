/**
 * 픽셀 맵 DSL (G14) — 문자 그리드 한 장이 도트 한 장이다. 카이로풍 「1텍셀 남색 외곽 + 파스텔 2톤」을
 * 손으로 찍는다. 색은 전부 CSS 토큰(`--px-*`) — TS 에 hex 를 두지 않는다 (S1 게이트).
 *
 *   '.' 투명 · 'k' 외곽(남색) · 'w' 흰 · 'W' 크림 · 'r/R' 빨강 · 'p/P' 분홍 · 'o/O' 주황 · 'y/Y' 노랑
 *   'g/G/d' 초록(밝음/어둠) · 'b/B/n' 파랑 · 'c/C' 물 · 'u/U' 보라 · 'm/M/e' 나무 · 't/T' 모래빛
 *   's/S/x' 회색 · 'h/H' 금 · 'q' 검정 · 'a' 청록 · '+' 하늘
 *   어두운 톤: '!' 빨강 · '@' 분홍 · '#' 주황 · '$' 노랑 · '%' 보라 · '^' 물 · '&' 크림 · '~' 청록 · '=' 금 (초록 d · 파랑 n · 나무 e · 회색 x)
 *   '1' 주제색 · '2' 주제색 밝은 톤 · '3' 주제색 어두운 톤 · '4' 보조색 — 스프라이트별 슬롯 (기본 파랑 b/B/n/w)
 */
import { cssVar } from '../../ui/tokens.js';

/** 화면에 찍히는 에셋 판 표식 — 폰에서 「어느 그림을 보고 있나」를 한눈에 (메뉴 제목·디버그 상자) */
export const ASSET_VERSION = '도트 v2';

const TOKEN: Record<string, string> = {
  k: 'ink', w: 'white', W: 'cream', r: 'red', R: 'red-lt', p: 'pink', P: 'pink-lt', o: 'orange', O: 'orange-lt',
  y: 'yellow', Y: 'yellow-lt', g: 'green', G: 'green-lt', d: 'green-dk', b: 'blue', B: 'blue-lt', n: 'blue-dk',
  c: 'water', C: 'water-lt', u: 'purple', U: 'purple-lt', m: 'wood', M: 'wood-lt', e: 'wood-dk', t: 'tan', T: 'tan-lt',
  s: 'gray', S: 'gray-lt', x: 'gray-dk', h: 'gold', H: 'gold-lt', q: 'black', a: 'aqua',
  // 어두운 톤 (3톤 명암의 그늘 면) — 기호 문자
  '!': 'red-dk', '@': 'pink-dk', '#': 'orange-dk', '$': 'yellow-dk', '%': 'purple-dk', '^': 'water-dk', '&': 'cream-dk', '~': 'aqua-dk', '=': 'gold-dk', '+': 'sky',
};

export type PixMap = readonly string[];
/** 주제색 슬롯 — 문자 '1'·'2'·'3' 을 팔레트 문자로 바꾼다 (예: `{ 1: 'r', 2: 'R', 3: 'n' }`) */
export type Slots = Partial<Record<'1' | '2' | '3' | '4', string>>;

const cache = new Map<string, string>();
export function pixColor(ch: string): string | null {
  const t = TOKEN[ch];
  if (!t) return null;
  let v = cache.get(t);
  if (v === undefined) { v = cssVar(`--px-${t}`); cache.set(t, v); }
  return v;
}

/** 맵을 (x, y) 좌상단에 찍는다. slots 로 1·2·3 을 바꾸고, 모르는 문자는 건너뛴다 */
export function blit(g: CanvasRenderingContext2D, rows: PixMap, x: number, y: number, slots: Slots = {}): void {
  const map: Record<string, string> = { '1': 'b', '2': 'B', '3': 'n', '4': 'w', ...slots };
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j] as string;
    for (let i = 0; i < row.length; i++) {
      let ch = row[i] as string;
      if (ch === '.' || ch === ' ') continue;
      if (map[ch] !== undefined) ch = map[ch] as string;
      const c = pixColor(ch);
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** 맵을 가로로 뒤집는다 (facing 1) */
export function flipX(rows: PixMap): PixMap {
  return rows.map((r) => [...r].reverse().join(''));
}

export function mapWidth(rows: PixMap): number {
  return rows.reduce((w, r) => Math.max(w, r.length), 0);
}

// ── 입체 생성기 (G14-2) — 손으로 50줄을 치지 않고 상자 볼륨을 만든 뒤 디테일만 얹는다 ──

/** 문자 그리드를 2차원 배열로 (편집용) */
export function toGrid(rows: PixMap): string[][] {
  const w = mapWidth(rows);
  return rows.map((r) => [...r.padEnd(w, '.')]);
}
export function fromGrid(g: string[][]): PixMap {
  return g.map((r) => r.join(''));
}

/**
 * 2:1 다이메트릭 상자 — 발자국 w×d 타일, 벽 높이 h. 캔버스 (w+d)·16 × ((w+d)·8 + h).
 * 윗면 `top`(밝음) · 왼쪽 앞면 `left`(기본) · 오른쪽 앞면 `right`(어두움), 면 경계와 실루엣은 `k` 1텍셀.
 * 기본 문자는 슬롯 2/1/3 이라 blit 의 slots 로 주제색이 들어간다.
 */
export function isoBox(w: number, d: number, h: number, faces: { top?: string; left?: string; right?: string } = {}): PixMap {
  const top = faces.top ?? '2';
  const left = faces.left ?? '1';
  const right = faces.right ?? '3';
  const W = (w + d) * 16;
  const H = (w + d) * 8 + h;
  const g: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  // 윗면 — 타일마다 다이아몬드
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const ox = (i - j + d - 1) * 16;
      const oy = (i + j) * 8;
      for (let y = 0; y < 16; y++) {
        const half = y < 8 ? y * 2 + 1 : (15 - y) * 2 + 1; // 1,3,…,15,15,…,3,1 → 폭 2·half
        const x0 = 16 - half;
        const x1 = 16 + half;
        for (let x = x0; x < x1; x++) g[oy + y]![ox + x] = top;
      }
    }
  }
  // 왼쪽 벽 — 왼 꼭짓점(0, d·8)에서 아래 꼭짓점(w·16, (w+d)·8)까지의 변 아래로 h
  for (let x = 0; x < w * 16; x++) {
    const ey = d * 8 + Math.floor(x / 2) + 1;
    for (let y = ey; y < ey + h && y < H; y++) if (g[y]![x] === '.') g[y]![x] = left;
  }
  // 오른쪽 벽
  for (let x = w * 16; x < W; x++) {
    const ey = (w + d) * 8 - Math.floor((x - w * 16) / 2);
    for (let y = ey; y < ey + h && y < H; y++) if (g[y]![x] === '.') g[y]![x] = right;
  }
  // 외곽·면 경계 — 이웃과 면이 다르면 k
  const out = g.map((r) => [...r]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = g[y]![x]!;
      if (c === '.') continue;
      const n = [g[y - 1]?.[x], g[y + 1]?.[x], g[y]![x - 1], g[y]![x + 1]];
      if (n.some((v) => v === undefined || v === '.' || v !== c)) out[y]![x] = 'k';
    }
  }
  return fromGrid(out);
}

/** 디테일 맵을 얹는다 ('.' 은 투명). 밖으로 나가는 부분은 버린다 */
export function overlay(base: PixMap, detail: PixMap, x: number, y: number): PixMap {
  const g = toGrid(base);
  detail.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      const r = g[y + j];
      if (r && x + i >= 0 && x + i < r.length) r[x + i] = ch;
    });
  });
  return fromGrid(g);
}

/** 여러 디테일을 차례로 */
export function compose(base: PixMap, ...parts: [PixMap, number, number][]): PixMap {
  return parts.reduce((acc, [m, x, y]) => overlay(acc, m, x, y), base);
}

/** 셀마다 함수를 적용 — 윗면 줄무늬·벽 창문처럼 「면 위의 무늬」를 계산으로 얹을 때 */
export function mapCells(rows: PixMap, fn: (x: number, y: number, ch: string) => string): PixMap {
  return rows.map((r, y) => [...r].map((ch, x) => fn(x, y, ch)).join(''));
}

/** 다이메트릭 벽 위의 평행사변형 — 왼쪽 벽(`side` 'L': 변이 x/2 만큼 내려감) 또는 오른쪽 벽('R': 올라감) 좌표계로 사각형을 찍는다 */
export function wallRect(g: string[][], side: 'L' | 'R', x0: number, x1: number, top: number, h: number, ch: string | ((x: number, y: number) => string), pivotX = 0): void {
  for (let x = x0; x < x1; x++) {
    const slope = side === 'L' ? Math.floor((x - pivotX) / 2) : -Math.floor((x - pivotX) / 2);
    for (let y = top + slope; y < top + slope + h; y++) {
      const row = g[y];
      if (!row || x < 0 || x >= row.length) continue;
      row[x] = typeof ch === 'string' ? ch : ch(x, y);
    }
  }
}
