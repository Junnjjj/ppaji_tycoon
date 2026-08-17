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
import {
  TILE_W,
  TILE_H,
  STEP_Y,
  tileRowSpan,
  tileOffsetInCanvas,
} from '../render/kairo/iso.js';
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

/**
 * 지면 기본색. 밝음·어두움은 여기서 **파생**한다 (§아래 GROUND_SPREAD).
 *
 * ## 레퍼런스 실측 — 지면은 우리보다 **매끈하다**
 *
 * 물체 에지를 걸러낸 순수 지면의 명암 표준편차가 **9~11** 이다 (흰 포장 10.9·10.3,
 * 물 8.9, 탄 데크 9.0). 처음엔 물체·연석이 섞인 박스를 재서 24.7 이 나왔고, 그 숫자를
 * 맞추려 노이즈를 키웠다가 잔디가 자갈처럼 됐다 (표준편차 16.6).
 *
 * 화면의 시각적 정보는 지면 노이즈가 아니라 **물체·연석·색 구역**에서 온다.
 * 지면은 조용해야 그 위의 것들이 읽힌다.
 */
const GROUND_BASE: Record<string, string> = {
  path_stone: '#c4c1b7',
  path_deck: '#ab8557',
  path_sand: '#d9c493',
  lawn: '#79a94f',
  water_edge: '#57a4c2',
  floor_indoor: '#dbe3e8',
};

/** 기본색에서 밝음·어두움을 만드는 배율. 표준편차 9~11 을 목표로 맞춘 값 */
const GROUND_SPREAD = { light: 1.10, dark: 0.90 } as const;

function groundTones(kind: string): [string, string, string] | null {
  const base = GROUND_BASE[kind];
  if (!base) return null;
  return [scaleHex(base, GROUND_SPREAD.light), base, scaleHex(base, GROUND_SPREAD.dark)];
}

/** 포장류는 타일 이음선을 보인다 — 레퍼런스의 포장이 그렇고, 격자가 읽혀야 각도가 보인다 */
const PAVED = new Set(['path_stone', 'path_deck', 'floor_indoor']);

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

/** 밝기 배율. 255 를 넘으면 잘린다 */
function scaleHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * 타일 하나를 **정수 스캔라인**으로 채운다.
 *
 * ⚠ `beginPath`+`fill()` 로 다이아몬드를 그리면 경계가 안티에일리어싱돼 타일 사이에
 * 1px 이음새가 보인다 (K1 에서 실제로 격자 무늬가 드러났다). 픽셀아트는 정수로 끊어야 한다.
 */
function fillTile(g: CanvasRenderingContext2D, ox: number, oy: number, color: string): void {
  g.fillStyle = color;
  for (let y = 0; y < TILE_H; y++) {
    const s = tileRowSpan(y);
    g.fillRect(ox + s.x0, oy + y, s.x1 - s.x0, 1);
  }
}

/**
 * 발자국 w×d 의 바닥면을 채운다 — 구성 타일을 하나씩 마스크로 깔기만 한다.
 * 다각형을 새로 계산하지 않는 이유: 타일 마스크가 이미 겹침·틈 0 을 보장하므로
 * 그걸 그대로 재사용하면 큰 발자국에서도 자동으로 이음새가 없다.
 */
function fillFootprint(
  g: CanvasRenderingContext2D,
  w: number,
  d: number,
  bodyH: number,
  color: string,
): void {
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const o = tileOffsetInCanvas(i, j, d, bodyH);
      fillTile(g, o.x, o.y, color);
    }
  }
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

/**
 * 스티플(체커) 구멍을 뚫는다. **아웃라인을 구운 뒤에** 불러야 한다.
 *
 * ⚠ 순서를 바꾸면 스티플이 사라진다. `bakeOutline` 은 "실체에 인접한 투명 픽셀"에
 * 윤곽색을 칠하는데, 50% 체커에서는 뚫린 픽셀 전부가 실체에 인접해 있어 구멍이 통째로
 * 메워진다 (실측: 투과율 0%). 그래서 **불투명하게 그리고 → 아웃라인 → 구멍 뚫기** 다.
 */
function punchStipple(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  keepSolid: (x: number, y: number) => boolean,
): void {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (keepSolid(x, y)) continue;
      if (((x + y) & 1) !== 0) g.fillRect(x, y, 1, 1);
    }
  }
  g.restore();
}

// ─────────────────────────────── 드로어 ───────────────────────────────

/**
 * 시설 — 바닥 다이아몬드 + 아이소 박스 몸통. **전부 정수 채움**.
 *
 * ⚠ 측면을 `beginPath`+`fill()` 로 그리면 안 된다. AA 경계가 반투명 픽셀을 남기고
 * `bakeOutline` 이 거기에 윤곽색을 찍어 **윗면에 검은 대각선**이 생긴다 (S=2 스크린샷에서
 * 드러났다). 벽과 같은 방식으로 열마다 정수 압출한다.
 */
function drawFacility(g: CanvasRenderingContext2D, spec: SpriteSpec, simId: string): void {
  const sim = KAIRO_SIM[simId];
  const [cw, ch] = spec.size;
  const [w, d] = sim ? sim.size : ([1, 1] as const);
  const [body, top, side] = ZONE_COLOR[sim?.layer ?? 'land'] ?? ZONE_COLOR['land']!;
  const bodyH = ch - (w + d) * STEP_Y;

  // 바닥 (그림자 겸 발자국 표시) — 몸통이 있으면 아래쪽에 남는 띠만 보인다
  fillFootprint(g, w, d, bodyH, darken(body, 0.72));

  if (bodyH <= 0) {
    bakeOutline(g, cw, ch);
    return;
  }

  // 윗면 — 같은 마스크를 위로 올려 깐다
  fillFootprint(g, w, d, 0, top);

  // 열마다 윗면의 최하단 y 를 찾아 아래로 bodyH 만큼 정수 압출한다
  const bottomOf = new Int16Array(cw).fill(-1);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const o = tileOffsetInCanvas(i, j, d, 0);
      for (let y = 0; y < TILE_H; y++) {
        const sp = tileRowSpan(y);
        for (let x = sp.x0; x < sp.x1; x++) {
          const gx = o.x + x;
          const gy = o.y + y;
          if (gx >= 0 && gx < cw && gy > bottomOf[gx]!) bottomOf[gx] = gy;
        }
      }
    }
  }
  for (let x = 0; x < cw; x++) {
    const t = bottomOf[x]!;
    if (t < 0) continue;
    g.fillStyle = x < cw / 2 ? side : body;
    g.fillRect(x, t + 1, 1, bodyH);
  }

  // 슬롯 위치를 옅은 점으로 — 배치 검증에 쓴다
  g.fillStyle = 'rgba(255,255,255,0.45)';
  const r = KAIRO.facilities.find((f) => f.sprite === spec.id);
  for (const sl of r?.slots ?? []) {
    const [i, j] = sl.tile;
    const o = tileOffsetInCanvas(i, j, d, 0);
    g.fillRect(o.x + TILE_W / 2 - 1, o.y + TILE_H / 2 - 1, 2, 2);
  }

  bakeOutline(g, cw, ch);
}

/**
 * 벽 — 스티플 유리. 스펙 §3.2~3.3.
 *
 * 타일 다이아몬드를 위쪽 뚜껑으로 두고 **아래로 H 만큼 정수 압출**한다. 열마다
 * 뚜껑의 최하단 y 를 찾아 그 아래를 채우므로 이웃 벽과 정확히 이어지고 이음새가 없다.
 *
 * 유리는 **알파 블렌딩이 아니라 50% 체커(스티플)** 다. 블렌딩은 팔레트에 없는 중간색을
 * 만들어 양자화가 비치는 형체를 지운다. 스티플은 새 색을 0개 만든다.
 *
 * 마스크가 0(독립 기둥)이면 좌우를 좁혀 기둥처럼 그린다 — 전부 같은 그림이면
 * 마스크 버그가 눈에 안 보인다.
 */
function drawWall(g: CanvasRenderingContext2D, spec: SpriteSpec, mask: number, door: boolean): void {
  const [cw, ch] = spec.size;
  const H = ch - TILE_H; // 압출 높이 (= KAIRO.wall.heightTexels)
  const FRAME = '#c3ced3';
  const PLINTH = '#8d979b';
  const GLASS_L = '#c9dae2';
  const GLASS_R = '#e2eef3';
  const PLINTH_H = 6;
  const inset = mask === 0 ? 6 : 0;

  // 열마다 뚜껑의 최하단 y — 여기서부터 아래로 압출한다
  const bottomOf = new Int16Array(cw).fill(-1);
  for (let y = 0; y < TILE_H; y++) {
    const sp = tileRowSpan(y);
    for (let x = sp.x0; x < sp.x1; x++) if (y > bottomOf[x]!) bottomOf[x] = y;
  }

  // ① 뚜껑 (벽의 윗면 — 불투명이 정상이다)
  for (let y = 0; y < TILE_H; y++) {
    const sp = tileRowSpan(y);
    const x0 = Math.max(sp.x0, inset);
    const x1 = Math.min(sp.x1, cw - inset);
    if (x1 <= x0) continue;
    g.fillStyle = FRAME;
    g.fillRect(x0, y, x1 - x0, 1);
  }

  // ② 앞쪽 두 면을 아래로 압출 — 일단 **전부 불투명**으로 그린다
  let paneTop = ch;
  let paneBottom = 0;
  for (let x = inset; x < cw - inset; x++) {
    const top = bottomOf[x]!;
    if (top < 0) continue;
    const left = x < cw / 2;
    for (let y = top + 1; y <= top + H; y++) {
      const fromBase = top + H - y;
      g.fillStyle = fromBase < PLINTH_H ? PLINTH : left ? GLASS_L : GLASS_R;
      g.fillRect(x, y, 1, 1);
      if (fromBase >= PLINTH_H) {
        if (y < paneTop) paneTop = y;
        if (y + 1 > paneBottom) paneBottom = y + 1;
      }
    }
  }

  // ③ 멀리온 — 중심 기둥은 불투명하게 세워 벽선을 읽히게 한다
  g.fillStyle = FRAME;
  g.fillRect(cw / 2 - 1, TILE_H / 2, 2, H);

  if (door) {
    // 문 — 아래 절반을 비워 통행 가능함을 보인다
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(cw / 2 - 5, ch - H / 2 - PLINTH_H, 10, H / 2);
    g.restore();
  }

  // ④ 아웃라인 — 실루엣이 아직 꽉 찬 상태에서 굽는다
  bakeOutline(g, cw, ch);

  // ⑤ 마지막에 유리 패널을 스티플로 뚫는다 (§3.3)
  punchStipple(g, inset, paneTop, cw - inset, paneBottom, (x, y) => {
    // 멀리온과 실루엣 가장자리는 남긴다 — 가장자리를 뚫으면 윤곽선이 끊긴다
    if (x >= cw / 2 - 1 && x <= cw / 2) return true;
    const top = bottomOf[x] ?? -1;
    if (top < 0) return true;
    if (y <= top + 1) return true; // 뚜껑과 붙은 첫 줄
    if (x <= inset + 1 || x >= cw - inset - 2) return true; // 좌우 가장자리
    return false;
  });
}

/**
 * 지면 타일 — 3단조 2텍셀 덩어리. 아웃라인 없음(이음새가 생긴다).
 *
 * 덩어리를 **2텍셀 가로 × 1텍셀 세로**로 두는 이유: 아이소에서 지면은 가로로 늘어져
 * 보이므로 정사각 덩어리는 세로로 길어 보인다. 레퍼런스의 자기상관도 가로 쪽이 더 길다.
 */
function drawGround(g: CanvasRenderingContext2D, spec: SpriteSpec, kind: string, alt: number): void {
  const [cw, ch] = spec.size;
  const tri = groundTones(kind);
  if (!tri) {
    // 다리 — 널 + 난간
    fillTile(g, 0, ch - TILE_H, '#a67c4a');
    g.fillStyle = '#8a6238';
    for (let k = 0; k < 4; k++) g.fillRect(4 + k * 7, ch - TILE_H, 2, TILE_H);
    g.fillStyle = '#c9a06a';
    g.fillRect(0, ch - TILE_H - 10, cw, 3);
    bakeOutline(g, cw, ch);
    return;
  }
  const [light, base, dark] = tri;
  const oy = ch - TILE_H;
  fillTile(g, 0, oy, base);

  // 마스크 안에서만 덩어리를 찍는다 — 밖에 찍으면 이웃 타일과 겹쳐 이음새가 된다
  for (let y = 0; y < TILE_H; y++) {
    const sp = tileRowSpan(y);
    for (let x = sp.x0; x < sp.x1; x++) {
      // 2옥타브 — 4×2 텍셀 큰 덩어리 + 2×1 텍셀 잔결.
      // 한 옥타브(가로만 2텍셀)로 하면 세로가 1텍셀 노이즈라 자기상관이 0.03 밖에
      // 안 나온다 (레퍼런스는 2px 에서 +0.49). 덩어리가 커야 질감으로 읽힌다.
      const seed = alt * 977 + kind.length;
      const r =
        0.62 * hash2(x >> 2, y >> 1, seed) + 0.38 * hash2(x >> 1, y, seed ^ 0x5bd1);
      if (r > 0.60) {
        g.fillStyle = light;
        g.fillRect(x, oy + y, 1, 1);
      } else if (r < 0.40) {
        g.fillStyle = dark;
        g.fillRect(x, oy + y, 1, 1);
      }
    }
  }

  // 포장류는 타일 이음선 — 아래쪽 두 변에 1텍셀 어두운 선
  if (PAVED.has(kind)) {
    g.fillStyle = dark;
    for (let y = TILE_H / 2; y < TILE_H; y++) {
      const sp = tileRowSpan(y);
      g.fillRect(sp.x0, oy + y, 1, 1);
      g.fillRect(sp.x1 - 1, oy + y, 1, 1);
    }
  }
}

/** 콤보 데코 — 작은 기둥 + 머리 */
function drawDeco(g: CanvasRenderingContext2D, spec: SpriteSpec, id: string): void {
  const [cw, ch] = spec.size;
  const item = KAIRO.deco.items.find((d) => d.id === id);
  const col = DECO_COLOR[item?.kind ?? 'scenery']!;
  fillTile(g, 0, ch - TILE_H, darken(col, 0.6));
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
