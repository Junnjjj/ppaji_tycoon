/**
 * 카이로 스프라이트의 **절차적 플레이스홀더**.
 *
 * AI 픽셀아트 119장을 뽑는 건 골 밖이다. 그동안 화면이 비어 있으면 K1~K6 을 검증할 수
 * 없으므로, 계약과 **정확히 같은 캔버스·앵커**로 코드가 그려 둔다. 나중에
 * `AtlasProvider` 로 갈아끼울 때 게임 코드는 0줄 바뀐다 — 그게 에셋 추상화의 목적이다.
 *
 * 플레이스홀더가 지켜야 하는 것 (이걸 어기면 나중에 실물로 바꿀 때 배치가 다 틀어진다):
 *   1. 캔버스 크기 = 계약값 그대로
 *   2. 바닥 다이아몬드가 캔버스 하단에 정확히 앉는다
 *   3. 앵커는 bottom-center
 *   4. 아웃라인 1텍셀을 **구워 넣는다** — 런타임 외곽선 패스가 없다
 *
 * 색은 구분용이지 최종 팔레트가 아니다. 존별로 색조를 달리해 배치 실수를 눈으로 잡는다.
 */

import { KAIRO, KAIRO_SIM, kairoSpriteSpecs } from './kairo-contract.js';
import { TILE_H, STEP_X, STEP_Y } from '../render/kairo/iso.js';
import { parseId, variantId } from './types.js';
import type { AssetProvider, SpriteSpec } from './types.js';

const OUTLINE = '#2b1d12';

/** 최종 ID → 기본 ID. `:` 앞이 기본 ID 다 (spec 없이도 구한다) */
function baseOf(id: string): string {
  const i = id.indexOf(':');
  return i < 0 ? id : id.slice(0, i);
}

/** 존별 색 — 몸통 / 윗면(밝게) / 측면(어둡게) */
const ZONE_COLOR: Record<string, [string, string, string]> = {
  indoor: ['#9fb8c9', '#c4d7e4', '#7492a6'],
  land: ['#c8a878', '#e0c79c', '#a3855a'],
  water: ['#78c8a8', '#a2e0c6', '#549e84'],
  pension: ['#c99a8a', '#e4bcac', '#a37468'],
  season: ['#b0a8d0', '#cec8e6', '#8b83ad'],
};

const GROUND_COLOR: Record<string, [string, string]> = {
  path_stone: ['#c9c6bd', '#b3b0a6'],
  path_deck: ['#b08a5c', '#96724a'],
  path_sand: ['#dcc79a', '#c6ae7d'],
  lawn: ['#7fb055', '#6a9846'],
  water_edge: ['#5fa8c4', '#4a8ba6'],
  floor_indoor: ['#dfe6ea', '#c6d0d6'],
};

const DECO_COLOR: Record<string, string> = { safety: '#d9694f', scenery: '#7ea9c9' };

function createCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error(
      'KairoProceduralProvider 는 브라우저에서만 동작합니다. ' +
        'sim/ 은 에셋에 의존하지 않으므로 헤드리스 러너에서는 필요하지 않습니다.',
    );
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 결정론적 해시 — 얼룩 배치. 같은 ID 는 항상 같은 그림이 나와야 한다 */
function hash2(x: number, y: number, s: number): number {
  let h = (s ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 발자국 w×d 의 바닥 다이아몬드 경로. 캔버스 하단에 정확히 앉는다 */
function footprintPath(g: CanvasRenderingContext2D, w: number, d: number, canvasH: number): void {
  const topY = canvasH - (w + d) * STEP_Y;
  const leftX = 0;
  // 꼭지점 4개: 위(i0,j0) · 오른(w,0) · 아래(w,d) · 왼(0,d)
  g.beginPath();
  g.moveTo(leftX + d * STEP_X, topY); // 위
  g.lineTo(leftX + (d + w) * STEP_X, topY + w * STEP_Y); // 오른
  g.lineTo(leftX + w * STEP_X, canvasH); // 아래
  g.lineTo(leftX, topY + d * STEP_Y); // 왼
  g.closePath();
}

/** 1텍셀 아웃라인을 구워 넣는다 — 런타임 외곽선 패스가 없다 */
function bakeOutline(g: CanvasRenderingContext2D, w: number, h: number): void {
  const img = g.getImageData(0, 0, w, h);
  const a = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3]! > 8;
  const out: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out.push([x, y]);
    }
  }
  g.fillStyle = OUTLINE;
  for (const [x, y] of out) g.fillRect(x, y, 1, 1);
}

// ─────────────────────────────── 드로어 ───────────────────────────────

/** 시설 — 바닥 다이아몬드 + 아이소 박스 몸통 */
function drawFacility(g: CanvasRenderingContext2D, spec: SpriteSpec, simId: string): void {
  const sim = KAIRO_SIM[simId];
  const [cw, ch] = spec.size;
  const [w, d] = sim ? sim.size : ([1, 1] as const);
  const [body, top, side] = ZONE_COLOR[sim?.layer ?? 'land'] ?? ZONE_COLOR['land']!;
  const bodyH = ch - (w + d) * STEP_Y;

  // 바닥 (그림자 겸 발자국 표시)
  footprintPath(g, w, d, ch);
  g.fillStyle = darken(body, 0.72);
  g.fill();

  if (bodyH > 0) {
    // 몸통을 다이아몬드 위로 밀어 올린 아이소 박스
    g.save();
    g.translate(0, -bodyH);
    footprintPath(g, w, d, ch);
    g.fillStyle = top;
    g.fill();
    g.restore();

    // 앞쪽 두 측면 (왼 꼭지점 → 아래 → 오른)
    const topY = ch - (w + d) * STEP_Y;
    const L = { x: 0, y: topY + d * STEP_Y };
    const B = { x: w * STEP_X, y: ch };
    const R = { x: (w + d) * STEP_X, y: topY + w * STEP_Y };
    for (const [p, q, col] of [
      [L, B, side],
      [B, R, body],
    ] as const) {
      g.beginPath();
      g.moveTo(p.x, p.y - bodyH);
      g.lineTo(q.x, q.y - bodyH);
      g.lineTo(q.x, q.y);
      g.lineTo(p.x, p.y);
      g.closePath();
      g.fillStyle = col;
      g.fill();
    }
    // 슬롯 위치를 옅은 점으로 — 배치 검증에 쓴다
    g.fillStyle = 'rgba(255,255,255,0.45)';
    const r = KAIRO.facilities.find((f) => f.sprite === spec.id);
    for (const s of r?.slots ?? []) {
      const [i, j] = s.tile;
      const x = (d + i - j) * STEP_X;
      const y = topY + (i + j + 1) * STEP_Y - bodyH;
      g.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  bakeOutline(g, cw, ch);
}

/**
 * 벽 — 스티플 유리. 스펙 §3.3.
 *
 * 알파 블렌딩이 아니라 **50% 체커**로 뚫는다. 블렌딩은 팔레트에 없는 중간색을 만들어
 * 양자화가 비치는 형체를 지운다. 스티플은 새 색을 0개 만든다.
 */
function drawWall(g: CanvasRenderingContext2D, spec: SpriteSpec, mask: number, door: boolean): void {
  const [cw, ch] = spec.size;
  const H = KAIRO.wall.heightTexels;
  const FRAME = '#b9c4c9';
  const PLINTH = '#8d979b';
  const GLASS = '#dbe8ee';

  // 이웃 방향 비트: 1=+I, 2=+J, 4=−I, 8=−J
  const dirs: [number, number, number][] = [
    [1, STEP_X, STEP_Y],
    [2, -STEP_X, STEP_Y],
    [4, -STEP_X, -STEP_Y],
    [8, STEP_X, -STEP_Y],
  ];
  const cx = cw / 2;
  const cy = ch - TILE_H / 2; // 타일 중심

  const seg = (dx: number, dy: number): void => {
    // 중심 → 이웃 방향 절반 구간의 벽 널
    const x0 = cx;
    const y0 = cy;
    const x1 = cx + dx / 2;
    const y1 = cy + dy / 2;
    // 기단 (불투명)
    g.beginPath();
    g.moveTo(x0, y0 - 6);
    g.lineTo(x1, y1 - 6);
    g.lineTo(x1, y1);
    g.lineTo(x0, y0);
    g.closePath();
    g.fillStyle = PLINTH;
    g.fill();
    // 유리 패널 (스티플)
    const yTop0 = y0 - H;
    const yTop1 = y1 - H;
    g.beginPath();
    g.moveTo(x0, yTop0);
    g.lineTo(x1, yTop1);
    g.lineTo(x1, y1 - 6);
    g.lineTo(x0, y0 - 6);
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = GLASS;
    for (let y = Math.floor(Math.min(yTop0, yTop1)); y < ch; y++) {
      for (let x = Math.floor(Math.min(x0, x1)); x <= Math.ceil(Math.max(x0, x1)); x++) {
        if (((x + y) & 1) === 0) g.fillRect(x, y, 1, 1); // 50% 체커
      }
    }
    g.restore();
  };

  if (mask === 0) {
    // 독립 기둥
    g.fillStyle = FRAME;
    g.fillRect(cx - 2, cy - H, 4, H);
  } else {
    for (const [bit, dx, dy] of dirs) if (mask & bit) seg(dx, dy);
    // 멀리온 (중심 기둥, 불투명)
    g.fillStyle = FRAME;
    g.fillRect(cx - 1, cy - H, 2, H);
  }

  if (door) {
    // 문 — 아래 절반을 비워 통행 가능함을 보인다
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(cx - 5, cy - H / 2, 10, H / 2);
    g.restore();
  }
  bakeOutline(g, cw, ch);
}

/** 지면 타일 — 다이아몬드를 채우고 얼룩을 넣는다. 아웃라인 없음(이음새가 생긴다) */
function drawGround(g: CanvasRenderingContext2D, spec: SpriteSpec, kind: string, alt: number): void {
  const [cw, ch] = spec.size;
  const pair = GROUND_COLOR[kind];
  if (!pair) {
    // 다리 — 널 + 난간
    g.fillStyle = '#a67c4a';
    footprintPath(g, 1, 1, ch);
    g.fill();
    g.fillStyle = '#8a6238';
    for (let k = 0; k < 4; k++) g.fillRect(4 + k * 7, ch - TILE_H, 2, TILE_H);
    g.fillStyle = '#c9a06a';
    g.fillRect(0, ch - TILE_H - 10, cw, 3);
    bakeOutline(g, cw, ch);
    return;
  }
  const [base, spot] = pair;
  footprintPath(g, 1, 1, ch);
  g.save();
  g.clip();
  g.fillStyle = base;
  g.fillRect(0, 0, cw, ch);
  g.fillStyle = spot;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (hash2(x, y, alt * 977 + kind.length) > 0.82) g.fillRect(x, y, 1, 1);
    }
  }
  g.restore();
}

/** 콤보 데코 — 작은 기둥 + 머리 */
function drawDeco(g: CanvasRenderingContext2D, spec: SpriteSpec, id: string): void {
  const [cw, ch] = spec.size;
  const item = KAIRO.deco.items.find((d) => d.id === id);
  const col = DECO_COLOR[item?.kind ?? 'scenery']!;
  footprintPath(g, 1, 1, ch);
  g.fillStyle = darken(col, 0.6);
  g.fill();
  const bodyH = ch - TILE_H;
  g.fillStyle = '#8f8478';
  g.fillRect(cw / 2 - 2, ch - TILE_H / 2 - bodyH, 4, bodyH);
  g.fillStyle = col;
  g.fillRect(cw / 2 - 6, ch - TILE_H / 2 - bodyH, 12, Math.min(10, bodyH));
  bakeOutline(g, cw, ch);
}

// ─────────────────────────────── 프로바이더 ───────────────────────────────

type Drawer = (g: CanvasRenderingContext2D, spec: SpriteSpec, finalId: string) => void;

/** `wall/glass:a5` → 5. 변형 없는 ID 는 0 */
function altOf(finalId: string, spec: SpriteSpec): number {
  return spec.variants?.alt ? parseId(finalId, spec).alt : 0;
}

/** ID 접두사 → 드로어. `missingDrawers()` 가 이 표의 빈틈을 잡는다 */
function drawerFor(baseId: string): Drawer | undefined {
  const [kind, name] = baseId.split('/') as [string, string];
  if (kind === 'facility') return (g, spec) => drawFacility(g, spec, name);
  if (kind === 'wall') {
    // 마스크는 alt 변형으로 들어온다 (`wall/glass:a5`)
    if (name === 'glass') return (g, spec, id) => drawWall(g, spec, altOf(id, spec), false);
    if (name.startsWith('door-'))
      return (g, spec) => drawWall(g, spec, name === 'door-x' ? 5 : 10, true);
    return undefined;
  }
  if (kind === 'ground') return (g, spec, id) => drawGround(g, spec, name, altOf(id, spec));
  if (kind === 'deco') return (g, spec) => drawDeco(g, spec, name);
  return undefined;
}

export class KairoProceduralProvider implements AssetProvider {
  readonly name = 'kairo-procedural';
  private readonly specs = new Map<string, SpriteSpec>();
  private readonly cache = new Map<string, HTMLCanvasElement>();
  readonly ids: readonly string[];

  constructor() {
    const ids: string[] = [];
    for (const s of kairoSpriteSpecs()) {
      this.specs.set(s.id, s);
      const alts = s.variants?.alt ?? 0;
      if (alts > 0) for (let a = 0; a < alts; a++) ids.push(variantId(s.id, { alt: a }));
      else ids.push(s.id);
    }
    this.ids = ids;
  }

  has(id: string): boolean {
    return this.specs.has(baseOf(id));
  }

  spec(id: string): SpriteSpec | undefined {
    return this.specs.get(baseOf(id));
  }

  get(id: string): HTMLCanvasElement {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const base = baseOf(id);
    const spec = this.specs.get(base);
    if (!spec) throw new Error(`카이로 플레이스홀더에 없는 ID: ${id}`);
    const draw = drawerFor(base);
    if (!draw) throw new Error(`드로어 없음: ${base}`);
    const canvas = createCanvas(spec.size[0], spec.size[1]);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2d 컨텍스트를 못 얻었습니다');
    g.imageSmoothingEnabled = false;
    draw(g, spec, id);
    this.cache.set(id, canvas);
    return canvas;
  }

  /**
   * 드로어가 빠진 ID 목록. **캔버스 없이** 돌기 때문에 헤드리스 테스트가 쓸 수 있다.
   * 계약에 스프라이트를 추가하고 드로어를 잊는 사고를 막는다.
   */
  static missingDrawers(): string[] {
    return kairoSpriteSpecs()
      .map((s) => s.id)
      .filter((id) => !drawerFor(id));
  }
}
