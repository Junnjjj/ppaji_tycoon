/**
 * 사건 카드의 **미니 장면** (Task 6).
 *
 * ## 왜 새 그림 8장을 안 그리는가
 *
 * 이전 슬롯은 `event/<theme>` 데이터 ID 에 CSS 색면 + 숫자·기호(`40`·`☂`·`₩`)였다.
 * 색면은 "테마가 있다"는 표시지 **사건 장면**이 아니다. 그렇다고 카드 8종을 위해 새
 * 픽셀아트 팩을 뽑으면(이 머신에서는 뽑지도 못한다) 계약·게이트·아틀라스가 전부 늘어난다.
 *
 * 그래서 **이미 있는 논리 스프라이트를 조합한다.** 매표소 + 걸어오는 손님 셋 =
 * "단체 손님이 몰렸다". 재료가 게임 화면과 같은 그림이라 카드가 게임의 한 장면으로 읽히고,
 * 나중에 아틀라스가 바뀌면 카드도 같이 바뀐다.
 *
 * ## 규칙
 *
 * · 구성은 **순수 함수**(`eventScenePlan`)가 정하고 그리기(`composeEventScene`)는 한 곳이다.
 * · 재료는 **계약에 이미 있는 ID 만** — 없는 ID 는 검사가 잡는다.
 * · 주역 그림을 못 얻으면 `null` 을 내고 **현재 CSS 테마 슬롯이 폴백**으로 남는다.
 * · 색은 `style.css` 가 소유한다 — 강조(비·동전·반짝임)도 `cssVar()` 로 토큰을 읽는다.
 */
import type { CardTheme } from '../sim/kairo/cards.js';
import { bakeGuestCell, type Facing, type Pose } from '../assets/kairo-guest-sprite.js';
import { cssVar } from './tokens.js';

/** 장면 캔버스의 **텍셀** 크기. 카드 이미지 슬롯(≈345×116px)과 같은 3:1 비율이다 */
export const EVENT_SCENE_TEXELS: readonly [number, number] = [240, 80];

/** 텍셀 → 픽셀 정수 배율. 카메라 줌이 아니라 정수 배율이라는 카이로 규칙과 같다 */
export const EVENT_SCENE_SCALE = 2;

export type EventSceneRole = 'ground' | 'subject' | 'support' | 'figure';

export interface EventSceneLayer {
  /** 논리 스프라이트 ID — `facility/…` · `deco/…` · `ground/…:aN` · `guest/…` */
  id: string;
  role: EventSceneRole;
  /** 텍셀 좌표. 앵커는 스프라이트 계약 그대로 **바닥중심** */
  x: number;
  y: number;
}

/** 그림만으로 안 읽히는 것(비·돈·플래시)을 얹는 절차적 강조 */
export type EventSceneAccent = 'none' | 'rain' | 'coin' | 'spark';

export interface EventScenePlan {
  theme: CardTheme;
  width: number;
  height: number;
  scale: number;
  accent: EventSceneAccent;
  layers: EventSceneLayer[];
}

/** 그리기에 필요한 최소한만 본다 — 가짜 캔버스로도 구성 검사를 할 수 있어야 한다 */
export interface EventSceneImage {
  readonly width: number;
  readonly height: number;
}

export interface EventSceneCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: EventSceneImage, x: number, y: number): void;
}

export interface EventSceneSurface<C> {
  canvas: C;
  ctx: EventSceneCtx;
}

export type EventSpriteSource = (id: string) => EventSceneImage | null;

const G = (palette: number, pose: Pose, facing: Facing): string =>
  `guest/${palette}/${pose}/${facing}`;

/**
 * 바닥 세 줄. **줄 간격은 8텍셀, 줄마다 x 를 16 어긋낸다** — 지면 타일이 32×16
 * 마름모라 이 값이어야 빈틈 없이 맞물린다.
 *
 * ⚠ 처음엔 두 줄에 간격 10 이었는데, 그러면 마름모 사이에 삼각형 구멍이 남아 바닥이
 * **흩어진 타일 조각**으로 보였다 (실측 캡처). 아이소 격자는 (16, 8) 어긋남이 정본이다.
 */
function floor(kind: string): EventSceneLayer[] {
  const out: EventSceneLayer[] = [];
  const [W, H] = EVENT_SCENE_TEXELS;
  for (let row = 0; row < 3; row++) {
    const y = H - 16 + row * 8;
    const dx = row % 2 === 0 ? 0 : 16;
    for (let x = dx; x <= W + 16; x += 32) out.push({ id: kind, role: 'ground', x, y });
  }
  return out;
}

/**
 * 테마 8종의 구성. **설명 문장이 아니라 재료 목록**이라 그림이 바뀌면 장면도 같이 바뀐다.
 *
 * 좌표는 손으로 골랐다 — 주역은 왼쪽 1/3, 사람은 가운데(시선이 먼저 닿는 자리),
 * 조역은 오른쪽이다. 사람이 주역보다 앞(아래)에 서야 장면에 깊이가 생긴다.
 */
const SCENES: Record<CardTheme, { ground: string; accent: EventSceneAccent; items: EventSceneLayer[] }> = {
  // 단체·혼잡 — 매표소 앞에 사람이 몰리고 주차장이 찼다
  crowd: {
    ground: 'ground/path_stone:a0',
    accent: 'none',
    items: [
      { id: 'facility/ticket', role: 'subject', x: 66, y: 74 },
      { id: 'facility/parking', role: 'support', x: 184, y: 80 },
      { id: G(1, 'walk', '+X'), role: 'figure', x: 112, y: 76 },
      { id: G(4, 'walk', '+X'), role: 'figure', x: 126, y: 80 },
      { id: G(6, 'idle', '+Z'), role: 'figure', x: 140, y: 72 },
    ],
  },
  // 날씨 — 비가 오면 그늘·실내로 몰린다
  weather: {
    ground: 'ground/path_deck:a0',
    accent: 'rain',
    items: [
      { id: 'facility/pavilion', role: 'subject', x: 70, y: 78 },
      { id: 'facility/parasol', role: 'support', x: 148, y: 74 },
      { id: 'deco/planter_row', role: 'support', x: 200, y: 80 },
      { id: G(2, 'walk', '+Z'), role: 'figure', x: 176, y: 80 },
    ],
  },
  // 안전 — 안전요원과 구명 장비
  safety: {
    ground: 'ground/path_sand:a0',
    accent: 'none',
    items: [
      { id: 'facility/infirmary', role: 'subject', x: 62, y: 76 },
      { id: 'deco/ring_rack', role: 'support', x: 132, y: 76 },
      { id: 'deco/first_aid', role: 'support', x: 196, y: 80 },
      { id: G(0, 'idle', '+X'), role: 'figure', x: 106, y: 80 },
      { id: G(3, 'idle', '-Z'), role: 'figure', x: 166, y: 74 },
    ],
  },
  // 홍보·방송 — 무대와 포토존에 사람이 선다
  publicity: {
    ground: 'ground/path_stone:a1',
    accent: 'spark',
    items: [
      { id: 'facility/stage_river', role: 'subject', x: 72, y: 78 },
      { id: 'facility/photozone', role: 'support', x: 184, y: 80 },
      { id: G(3, 'idle', '+X'), role: 'figure', x: 126, y: 76 },
      { id: G(5, 'idle', '-X'), role: 'figure', x: 140, y: 80 },
    ],
  },
  // 직원 — 사무동과 안내소, 근무 중인 둘
  staff: {
    ground: 'ground/floor_indoor:a0',
    accent: 'none',
    items: [
      { id: 'facility/office', role: 'subject', x: 60, y: 76 },
      { id: 'facility/info', role: 'support', x: 186, y: 80 },
      { id: G(6, 'idle', '+X'), role: 'figure', x: 112, y: 76 },
      { id: G(7, 'idle', '+Z'), role: 'figure', x: 128, y: 80 },
    ],
  },
  // 경영·거래 — 매점·간이매점에서 돈이 돈다
  market: {
    ground: 'ground/path_stone:a2',
    accent: 'coin',
    items: [
      { id: 'facility/shop', role: 'subject', x: 62, y: 76 },
      { id: 'facility/snackbar', role: 'support', x: 184, y: 80 },
      { id: G(2, 'idle', '+X'), role: 'figure', x: 114, y: 76 },
      { id: G(5, 'walk', '+X'), role: 'figure', x: 130, y: 80 },
    ],
  },
  // 시설·장비 — 큰 시설과 창고, 점검 표지
  facility: {
    ground: 'ground/path_deck:a1',
    accent: 'none',
    items: [
      { id: 'facility/sauna', role: 'subject', x: 68, y: 78 },
      { id: 'deco/safety_sign', role: 'support', x: 132, y: 74 },
      { id: 'facility/storage', role: 'support', x: 194, y: 80 },
      { id: G(4, 'idle', '-Z'), role: 'figure', x: 152, y: 80 },
    ],
  },
  // 환경 — 물가의 분수와 화단·수풀
  environment: {
    ground: 'ground/water_edge:a0',
    accent: 'none',
    items: [
      { id: 'facility/fountain', role: 'subject', x: 64, y: 74 },
      { id: 'facility/flowerbed', role: 'support', x: 124, y: 80 },
      { id: 'deco/planter_row', role: 'support', x: 158, y: 74 },
      { id: 'deco/sculpture', role: 'support', x: 202, y: 80 },
      { id: G(1, 'idle', '+Z'), role: 'figure', x: 100, y: 80 },
    ],
  },
};

/**
 * 테마 하나의 구성 계획. **순수 함수**다 — 같은 테마는 언제나 같은 장면이라
 * 캡처 비교와 사람 검수가 성립한다 (난수를 쓰면 "이 카드가 달라 보인다"를 못 잰다).
 */
export function eventScenePlan(theme: CardTheme): EventScenePlan {
  const scene = SCENES[theme];
  return {
    theme,
    width: EVENT_SCENE_TEXELS[0],
    height: EVENT_SCENE_TEXELS[1],
    scale: EVENT_SCENE_SCALE,
    accent: scene.accent,
    layers: [...floor(scene.ground), ...scene.items.map((item) => ({ ...item }))],
  };
}

/** 절차적 강조 — 토큰 색으로만 그린다 (§색은 style.css 가 소유한다) */
function drawAccent(ctx: EventSceneCtx, plan: EventScenePlan): void {
  if (plan.accent === 'none') return;
  ctx.save();
  if (plan.accent === 'rain') {
    ctx.fillStyle = cssVar('--event-ink');
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 26; k++) {
      const x = (k * 47) % plan.width;
      const y = (k * 29) % (plan.height - 10);
      for (let s = 0; s < 5; s++) ctx.fillRect(x + s, y + s * 2, 1, 2);
    }
  } else if (plan.accent === 'coin') {
    /*
     * ⚠ 동전은 **테마 색면 위에** 얹힌다 — 같은 계열(`--event-market-b`)로 그렸더니
     * 갈색 하늘에 묻혀 안 보였다 (실측 캡처). 현금 알약의 글자색을 쓴다.
     */
    ctx.fillStyle = cssVar('--cash-text');
    ctx.globalAlpha = 0.95;
    for (const [x, y] of [
      [150, 22],
      [162, 14],
      [174, 26],
    ] as const) {
      ctx.fillRect(x + 1, y, 4, 6);
      ctx.fillRect(x, y + 1, 6, 4);
    }
  } else {
    // 반짝임도 같은 이유로 밝은 글자색을 쓴다 (테마 색면 위 대비)
    ctx.fillStyle = cssVar('--event-ink');
    ctx.globalAlpha = 0.9;
    for (const [x, y] of [
      [104, 16],
      [156, 10],
      [196, 24],
    ] as const) {
      ctx.fillRect(x - 4, y, 9, 1);
      ctx.fillRect(x, y - 4, 1, 9);
    }
  }
  ctx.restore();
}

/**
 * 계획을 캔버스로 합성한다. **주역이 없으면 `null`** — 부르는 쪽이 CSS 폴백으로 남긴다.
 *
 * ⚠ 조역·인물이 없다고 실패로 치지 않는다. 아틀라스가 한 장 빠져도 카드가 멀쩡히 뜨는 것이
 * `HybridProvider` 규칙("프레임이 계약과 다르면 그 ID 만 버린다")과 같은 태도다.
 */
export function composeEventScene<C>(
  plan: EventScenePlan,
  resolve: EventSpriteSource,
  make: (w: number, h: number) => EventSceneSurface<C>,
): C | null {
  const drawable: { image: EventSceneImage; layer: EventSceneLayer }[] = [];
  for (const layer of plan.layers) {
    const image = resolve(layer.id);
    if (!image) {
      if (layer.role === 'subject') return null;
      continue;
    }
    drawable.push({ image, layer });
  }
  if (drawable.length === 0) return null;

  const surface = make(plan.width * plan.scale, plan.height * plan.scale);
  const ctx = surface.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(plan.scale, 0, 0, plan.scale, 0, 0);
  for (const { image, layer } of drawable) {
    ctx.drawImage(image, Math.round(layer.x - image.width / 2), Math.round(layer.y - image.height));
  }
  drawAccent(ctx, plan);
  return surface.canvas;
}

/** 브라우저용 캔버스 공장 — 검사는 가짜를 넣는다 */
export function createSceneSurface(w: number, h: number): EventSceneSurface<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.className = 'kcard-scene';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d 컨텍스트를 못 얻었습니다');
  /*
   * ⚠ 캐스팅은 **여기 한 곳**이다. `EventSceneCtx` 는 그리기에 쓰는 최소 표면이라
   * `drawImage` 의 오버로드(9인자·`CanvasImageSource` 유니언)와 구조적으로 안 맞는다.
   * 좁은 계약을 유지하는 값이 더 크다 — 그래야 가짜 캔버스로 구성 자체를 검사할 수 있다.
   */
  return { canvas, ctx: ctx as unknown as EventSceneCtx };
}

/** `provider` 가 아는 ID 와 손님 한 칸을 함께 푸는 해석기 */
export function createEventSpriteSource(provider: {
  has(id: string): boolean;
  get(id: string): HTMLCanvasElement;
}): EventSpriteSource {
  const guests = new Map<string, HTMLCanvasElement>();
  return (id: string) => {
    if (id.startsWith('guest/')) {
      const hit = guests.get(id);
      if (hit) return hit;
      const [, palette, pose, facing] = id.split('/');
      if (palette === undefined || pose === undefined || facing === undefined) return null;
      const cell = bakeGuestCell(Number(palette), pose as Pose, facing as Facing);
      guests.set(id, cell);
      return cell;
    }
    return provider.has(id) ? provider.get(id) : null;
  };
}
