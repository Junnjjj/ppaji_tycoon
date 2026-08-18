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

/*
 * 경계 방향 — `KAIRO.wall.edgeNames` 의 순서와 같다. sim 의 `DIR_*` 와 값이 같지만
 * **여기서 다시 선언한다**: assets 가 sim 을 import 하면 의존 방향이 뒤집힌다.
 * 계약 테스트가 두 값이 어긋나지 않는지 지킨다.
 */
const DIR_I_PLUS_IDX = 0;
const DIR_J_PLUS_IDX = 1;
const DIR_J_MINUS_IDX = 3;

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
  /*
   * 도시 띠 (K36) — 공원 밖이라 **채도를 낮춘다.** 공원과 같은 채도로 두면 눈이
   * 어디까지가 내 땅인지 못 가른다. 회색 아스팔트 · 밝은 보도 · 짙은 가로수.
   */
  road: '#5f6570',
  sidewalk: '#b9bcc0',
  verge: '#4f7742',
};

/** 기본색에서 밝음·어두움을 만드는 배율. 표준편차 9~11 을 목표로 맞춘 값 */
const GROUND_SPREAD = { light: 1.10, dark: 0.90 } as const;

function groundTones(kind: string): [string, string, string] | null {
  const base = GROUND_BASE[kind];
  if (!base) return null;
  return [scaleHex(base, GROUND_SPREAD.light), base, scaleHex(base, GROUND_SPREAD.dark)];
}

/**
 * 포장류는 타일 이음선을 보인다 — 레퍼런스의 포장이 그렇고, 격자가 읽혀야 각도가 보인다.
 *
 * ⚠ 가로수(`verge`)도 여기 넣는다 (K36). 유기적으로 그리면 이음새 대비가 2.9배로
 * 튀어 4방 이음새 QA 를 넘는다 (문턱 ~2.5). 도시의 가로 화단은 **칸으로 나뉜 화단**이라
 * 타일 이음선이 오히려 맞다.
 */
const PAVED = new Set(['path_stone', 'path_deck', 'floor_indoor', 'road', 'sidewalk', 'verge']);

const DECO_COLOR: Record<string, string> = { safety: '#d9694f', scenery: '#7ea9c9' };

/**
 * 걸어 올라가는 물 위 구조물(플로팅덱·선착장)은 **목재 색**으로 뺀다.
 * 물 위 시설과 같은 초록·청록으로 두면 물빛에 묻혀 잔교가 어디까지 뻗었는지 안 보인다
 * (스크린샷에서 실제로 안 보였다).
 */
const WALKON_COLOR: [string, string, string] = ['#b8895a', '#d0a878', '#966d44'];

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
  const [body, top, side] = sim?.walkOn
    ? WALKON_COLOR
    : (ZONE_COLOR[sim?.layer ?? 'land'] ?? ZONE_COLOR['land']!);
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
 * 벽 — **타일 경계에 선 얇은 유리 패널** (K25). 스펙 §3.2~3.3.
 *
 * ## 왜 다이아몬드 한 칸을 통째로 칠하지 않나
 *
 * 예전에는 벽이 칸을 통째로 먹어서 두꺼운 상자로 보였다 — 32텍셀 두께의 벽이다.
 * 실제 카이로 게임의 벽은 **칸과 칸 사이**에 서 있고, 바닥은 벽 밑까지 이어진다.
 * 이제 벽은 다이아몬드의 **한 변**만 따라간다 (길이 16텍셀, 두께 3).
 *
 * ## 네 변의 기하
 *
 * 화면에서 다이아몬드의 네 변은 각각 한 방향의 이웃과 맞닿는다:
 *   +I 오른쪽아래 · +J 왼쪽아래 · −I 왼쪽위 · −J 오른쪽위
 *
 * 변을 따라가는 열마다 밑변 y 를 구한 뒤 위로 H 만큼 정수 압출한다. 열 단위 정수라
 * 이웃 벽과 텍셀이 정확히 맞물린다 — AA `fill()` 로 사변형을 그리면 이음새가 생긴다.
 *
 * 유리는 **알파 블렌딩이 아니라 50% 체커(스티플)** 다. 블렌딩은 팔레트에 없는 중간색을
 * 만들어 양자화가 비치는 형체를 지운다. 스티플은 새 색을 0개 만든다.
 */
function drawWall(g: CanvasRenderingContext2D, spec: SpriteSpec, dir: number, door: boolean): void {
  const [cw, ch] = spec.size;
  const H = KAIRO.wall.heightTexels;
  const T = KAIRO.wall.thicknessTexels;
  const CAP = '#c3ced3';
  const PLINTH = '#8d979b';
  const GLASS_L = '#c9dae2';
  const GLASS_R = '#e2eef3';
  const PLINTH_H = 5;

  const baseY = ch - TILE_H; // 다이아몬드 위 꼭지점의 y
  const right = dir === DIR_I_PLUS_IDX || dir === DIR_J_MINUS_IDX; // 화면 오른쪽 변인가
  const lower = dir === DIR_I_PLUS_IDX || dir === DIR_J_PLUS_IDX; // 아래쪽 변인가

  /** 그 열에서 변의 y (없으면 −1) */
  const edgeY = (x: number): number => {
    if (right && x < TILE_W / 2) return -1;
    if (!right && x >= TILE_W / 2) return -1;
    // 중심에서 밖으로 갈수록 위/아래 꼭지점에서 좌우 꼭지점으로 반 칸씩 이동한다
    const k = right ? x - TILE_W / 2 : TILE_W / 2 - 1 - x;
    return lower ? baseY + TILE_H - 1 - (k >> 1) : baseY + (k >> 1);
  };

  // ① 패널 — 변을 따라 두께 T 로 위로 압출
  let paneTop = ch;
  let paneBottom = 0;
  for (let x = 0; x < cw; x++) {
    const y0 = edgeY(x);
    if (y0 < 0) continue;
    for (let t = 0; t < T; t++) {
      const yb = y0 - t; // 두께는 화면 위쪽으로 쌓는다 (바닥 두께감)
      for (let y = yb - H + 1; y <= yb; y++) {
        if (y < 0 || y >= ch) continue;
        const fromBase = yb - y;
        if (fromBase >= H - 2) {
          g.fillStyle = CAP; // 맨 위 두 줄은 갓
        } else if (fromBase < PLINTH_H) {
          g.fillStyle = PLINTH;
        } else {
          g.fillStyle = right ? GLASS_R : GLASS_L;
          if (y < paneTop) paneTop = y;
          if (y + 1 > paneBottom) paneBottom = y + 1;
        }
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  // ② 멀리온 — 4텍셀마다 불투명 기둥. 없으면 스티플이 전부를 먹어 벽선이 안 읽힌다
  for (let x = 0; x < cw; x++) {
    if (x % 4 !== (right ? 2 : 1)) continue;
    const y0 = edgeY(x);
    if (y0 < 0) continue;
    g.fillStyle = CAP;
    for (let y = y0 - H + 1; y <= y0; y++) if (y >= 0 && y < ch) g.fillRect(x, y, 1, 1);
  }

  if (door) {
    // 문 — 패널 가운데를 뚫어 통행 가능함을 보인다
    const mid = right ? TILE_W * 0.75 : TILE_W * 0.25;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let x = Math.round(mid - 5); x <= Math.round(mid + 5); x++) {
      const y0 = edgeY(x);
      if (y0 < 0) continue;
      for (let t = 0; t < T; t++) {
        g.fillRect(x, y0 - t - H + 2, 1, H - PLINTH_H - 2);
      }
    }
    g.restore();
  }

  // ③ 아웃라인 — 실루엣이 아직 꽉 찬 상태에서 굽는다
  bakeOutline(g, cw, ch);

  // ④ 마지막에 유리 패널을 스티플로 뚫는다 (§3.3)
  if (paneBottom > paneTop) {
    punchStipple(g, 0, paneTop, cw, paneBottom, (x, y) => {
      if (x % 4 === (right ? 2 : 1)) return true; // 멀리온
      const y0 = edgeY(x);
      if (y0 < 0) return true;
      if (y >= y0 - PLINTH_H) return true; // 굽
      if (y <= y0 - H + 3) return true; // 갓 아래 첫 줄
      return false;
    });
  }
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
    // 방향은 alt 변형으로 들어온다 (`wall/edge:a2` = −I 면)
    if (name === 'edge') return (g, spec, id) => drawWall(g, spec, altOf(id, spec), false);
    if (name === 'door') return (g, spec, id) => drawWall(g, spec, altOf(id, spec), true);
    return undefined;
  }
  if (kind === 'ground') return (g, spec, id) => drawGround(g, spec, name, altOf(id, spec));
  if (kind === 'backdrop') return (g, spec) => drawBackdrop(g, spec, name);
  if (kind === 'deco') return (g, spec) => drawDeco(g, spec, name);
  return undefined;
}

/**
 * 배경 띠 — 능선(ridge)과 먼 강둑(farbank).
 *
 * ## 가로로 이어져야 한다
 *
 * 카메라가 옆으로 움직이면 같은 그림이 반복된다. 그래서 **왼쪽 끝과 오른쪽 끝이 이어져야**
 * 하고, 그건 "폭의 배수 주기를 가진 함수만 쓴다"로 보장한다 — 랩 크로스페이드로 덧칠하면
 * 그 부분만 색이 달라져 오히려 이음새가 보인다 (컨셉 배경에서 실제로 겪었다).
 *
 * ## 하늘도 물도 안 그린다
 *
 * 하늘은 배경색, 물은 지면 스프라이트가 그린다 (계약의 `sky:false`, `water:false`).
 * 여기서 또 그리면 색이 두 곳에서 정해져 어긋난다.
 */
function drawBackdrop(
  g: CanvasRenderingContext2D,
  spec: SpriteSpec,
  name: string,
): void {
  const [w, h] = spec.size;
  const ridge = name === 'ridge';
  // 능선은 멀고 흐리다(대기 원근), 강둑은 가깝고 진하다
  const body = ridge ? '#5b7f96' : '#3f6b57';
  const lit = ridge ? '#7496aa' : '#548a6c';
  const dark = ridge ? '#48697e' : '#2f5442';

  // 주기가 폭의 약수인 사인 합 — 끝과 끝이 정확히 맞는다
  const peak = (x: number): number => {
    const t = (x / w) * Math.PI * 2;
    return ridge
      ? h * 0.52 + Math.sin(t) * h * 0.18 + Math.sin(t * 3 + 1.1) * h * 0.09
      : h * 0.72 + Math.sin(t * 2 + 0.4) * h * 0.08 + Math.sin(t * 5) * h * 0.04;
  };

  for (let x = 0; x < w; x++) {
    const top = Math.round(h - peak(x));
    for (let y = top; y < h; y++) {
      // 위쪽은 밝게, 아래로 갈수록 어둡게 — 2단 명암 (플레이스홀더 규칙)
      const d = (y - top) / Math.max(1, h - top);
      g.fillStyle = d < 0.18 ? lit : d > 0.72 ? dark : body;
      g.fillRect(x, y, 1, 1);
    }
    // 능선 위 1텍셀 아웃라인
    g.fillStyle = OUTLINE;
    g.fillRect(x, top, 1, 1);
  }

  if (!ridge) {
    // 강둑에는 나무 실루엣을 얹는다 — 주기를 폭의 약수로 둬야 끝이 맞는다
    const trees = 24;
    for (let k = 0; k < trees; k++) {
      const cx = Math.round((k * w) / trees) + 3;
      const base = Math.round(h - peak(cx));
      const th = 8 + ((k * 7) % 9);
      for (let y = base - th; y < base; y++) {
        const half = Math.max(1, Math.round(((base - y) / th) * 3));
        for (let x = cx - half; x <= cx + half; x++) {
          g.fillStyle = y < base - th * 0.7 ? lit : dark;
          g.fillRect(((x % w) + w) % w, y, 1, 1);
        }
      }
    }
  }
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
