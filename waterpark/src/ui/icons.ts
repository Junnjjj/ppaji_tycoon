/**
 * 아이콘 등록부 — 화면의 모든 표식이 여기 하나에 산다. **이모지 0** (기기마다 그림이 다르다).
 * 16×16 캔버스에 도형으로 굽고 `data:` URL 을 CSS 배경으로 준다 (`image-rendering: pixelated`, 2×).
 * 문자열 API 는 없다 — 요소 자리(`iconEl`)만 있어야 나중에 그림으로 갈아 끼울 수 있다.
 */
import { cssVar } from './tokens.js';

export type IconName =
  | 'build' | 'pool' | 'sns' | 'cook' | 'shop' | 'save' | 'inbox' | 'menu'
  | 'lock' | 'coin' | 'star' | 'heart' | 'close' | 'check'
  // G29 — 건설 탭 6 · SNS 탭 3 · 계절 4 · 날씨 4
  | 'utility' | 'lounge' | 'restaurant' | 'attraction' | 'slide' | 'decor'
  | 'timeline' | 'message' | 'friends'
  | 'spring' | 'summer' | 'autumn' | 'winter' | 'sun' | 'rain' | 'snow' | 'cloud'
  | 'gift'
  // G54 — 요리 재료 9계열 (ingredients.json `class`)
  | 'fruit' | 'base' | 'sweet' | 'dairy' | 'seafood' | 'grain' | 'veg' | 'meat' | 'nut';

type Painter = (g: CanvasRenderingContext2D, c: { ink: string; a: string; b: string; w: string }) => void;

const px = (g: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

const PAINT: Record<IconName, Painter> = {
  build: (g, c) => { px(g, c.a, 3, 8, 10, 6); px(g, c.ink, 3, 8, 10, 1); px(g, c.b, 5, 3, 2, 6); px(g, c.b, 5, 3, 7, 1); px(g, c.w, 11, 4, 2, 2); },
  pool: (g, c) => { px(g, c.a, 2, 5, 12, 8); px(g, c.w, 3, 6, 4, 1); px(g, c.w, 8, 9, 4, 1); px(g, c.ink, 2, 4, 12, 1); },
  sns: (g, c) => { px(g, c.a, 2, 5, 12, 8); px(g, c.ink, 5, 3, 6, 2); px(g, c.w, 6, 7, 4, 4); px(g, c.b, 7, 8, 2, 2); },
  cook: (g, c) => { px(g, c.a, 3, 7, 10, 6); px(g, c.ink, 2, 7, 12, 1); px(g, c.b, 5, 3, 2, 4); px(g, c.b, 9, 3, 2, 4); px(g, c.w, 4, 9, 8, 1); },
  shop: (g, c) => { px(g, c.a, 3, 6, 10, 7); px(g, c.b, 2, 4, 12, 2); px(g, c.w, 4, 8, 3, 3); px(g, c.ink, 7, 8, 2, 5); },
  save: (g, c) => { px(g, c.a, 3, 2, 10, 12); px(g, c.w, 5, 3, 6, 4); px(g, c.ink, 5, 10, 6, 3); },
  inbox: (g, c) => { px(g, c.a, 2, 4, 12, 9); px(g, c.ink, 2, 4, 12, 1); px(g, c.w, 3, 5, 10, 4); px(g, c.b, 4, 9, 8, 1); },
  menu: (g, c) => { px(g, c.a, 2, 3, 12, 2); px(g, c.a, 2, 7, 12, 2); px(g, c.a, 2, 11, 12, 2); px(g, c.ink, 2, 5, 12, 1); },
  lock: (g, c) => { px(g, c.b, 4, 7, 8, 7); px(g, c.a, 5, 3, 6, 4); px(g, c.w, 6, 4, 4, 2); px(g, c.ink, 7, 9, 2, 3); },
  coin: (g, c) => { px(g, c.a, 4, 3, 8, 10); px(g, c.a, 3, 4, 10, 8); px(g, c.w, 6, 5, 4, 6); px(g, c.ink, 7, 6, 2, 4); },
  star: (g, c) => { px(g, c.a, 7, 2, 2, 12); px(g, c.a, 2, 6, 12, 2); px(g, c.a, 4, 4, 8, 6); px(g, c.w, 7, 5, 2, 2); },
  heart: (g, c) => { px(g, c.a, 3, 4, 4, 3); px(g, c.a, 9, 4, 4, 3); px(g, c.a, 2, 6, 12, 3); px(g, c.a, 4, 9, 8, 2); px(g, c.a, 6, 11, 4, 2); px(g, c.w, 4, 5, 2, 1); },
  close: (g, c) => { for (let k = 0; k < 10; k++) { px(g, c.ink, 3 + k, 3 + k, 2, 2); px(g, c.ink, 12 - k, 3 + k, 2, 2); } },
  check: (g, c) => { for (let k = 0; k < 4; k++) px(g, c.a, 3 + k, 8 + k, 2, 2); for (let k = 0; k < 7; k++) px(g, c.a, 6 + k, 11 - k, 2, 2); },
  // 건설 탭 — 편의(변기) · 라운지(데크체어) · 식당(컵) · 놀이(제트 물결) · 슬라이드(경사) · 장식(화분)
  utility: (g, c) => { px(g, c.w, 4, 8, 8, 5); px(g, c.ink, 4, 8, 8, 1); px(g, c.a, 5, 3, 6, 5); px(g, c.b, 6, 4, 4, 2); },
  lounge: (g, c) => { px(g, c.a, 2, 9, 12, 3); px(g, c.a, 3, 5, 5, 4); px(g, c.w, 4, 6, 3, 1); px(g, c.ink, 3, 12, 2, 2); px(g, c.ink, 11, 12, 2, 2); },
  restaurant: (g, c) => { px(g, c.w, 4, 4, 8, 8); px(g, c.a, 4, 4, 8, 2); px(g, c.b, 12, 6, 2, 4); px(g, c.ink, 5, 12, 6, 1); },
  attraction: (g, c) => { px(g, c.a, 2, 9, 12, 4); px(g, c.w, 3, 10, 3, 1); px(g, c.w, 9, 11, 3, 1); px(g, c.b, 7, 3, 2, 6); px(g, c.b, 5, 5, 6, 1); },
  slide: (g, c) => { px(g, c.b, 2, 3, 4, 8); px(g, c.a, 5, 3, 2, 2); for (let k = 0; k < 7; k++) px(g, c.a, 5 + k, 4 + k, 3, 2); px(g, c.w, 3, 4, 2, 1); },
  decor: (g, c) => { px(g, c.b, 5, 9, 6, 5); px(g, c.a, 6, 3, 4, 6); px(g, c.a, 4, 5, 8, 2); px(g, c.w, 7, 4, 2, 1); },
  // SNS 탭 — 타임라인(사진) · 메시지(봉투) · 친구(두 사람)
  timeline: (g, c) => { px(g, c.w, 2, 3, 12, 10); px(g, c.ink, 2, 3, 12, 1); px(g, c.a, 3, 5, 10, 6); px(g, c.b, 5, 7, 3, 3); },
  message: (g, c) => { px(g, c.w, 2, 4, 12, 9); px(g, c.ink, 2, 4, 12, 1); px(g, c.a, 3, 5, 10, 3); px(g, c.a, 7, 8, 2, 1); },
  friends: (g, c) => { px(g, c.a, 4, 3, 3, 3); px(g, c.a, 3, 7, 5, 6); px(g, c.b, 10, 4, 3, 3); px(g, c.b, 9, 8, 5, 5); px(g, c.w, 5, 4, 1, 1); },
  // 계절 — 봄(꽃) · 여름(해) · 가을(낙엽) · 겨울(눈결정)
  spring: (g, c) => { px(g, c.a, 6, 2, 4, 3); px(g, c.a, 2, 6, 3, 4); px(g, c.a, 11, 6, 3, 4); px(g, c.a, 6, 11, 4, 3); px(g, c.w, 6, 6, 4, 4); px(g, c.b, 7, 7, 2, 2); },
  summer: (g, c) => { px(g, c.a, 5, 5, 6, 6); px(g, c.w, 6, 6, 2, 2); px(g, c.a, 7, 2, 2, 2); px(g, c.a, 7, 12, 2, 2); px(g, c.a, 2, 7, 2, 2); px(g, c.a, 12, 7, 2, 2); },
  autumn: (g, c) => { px(g, c.a, 4, 4, 8, 6); px(g, c.a, 6, 3, 4, 1); px(g, c.ink, 7, 6, 2, 8); px(g, c.b, 5, 5, 2, 2); },
  winter: (g, c) => { px(g, c.w, 7, 2, 2, 12); px(g, c.w, 2, 7, 12, 2); px(g, c.w, 4, 4, 2, 2); px(g, c.w, 10, 4, 2, 2); px(g, c.w, 4, 10, 2, 2); px(g, c.w, 10, 10, 2, 2); },
  // 날씨 — 맑음(해) · 비(구름+빗줄) · 눈(구름+눈송이) · 흐림(구름)
  sun: (g, c) => { px(g, c.a, 5, 5, 6, 6); px(g, c.w, 6, 6, 2, 2); px(g, c.a, 7, 2, 2, 2); px(g, c.a, 7, 12, 2, 2); px(g, c.a, 2, 7, 2, 2); px(g, c.a, 12, 7, 2, 2); },
  rain: (g, c) => { px(g, c.w, 3, 4, 10, 5); px(g, c.w, 5, 2, 6, 3); px(g, c.b, 4, 10, 1, 3); px(g, c.b, 7, 11, 1, 3); px(g, c.b, 10, 10, 1, 3); },
  snow: (g, c) => { px(g, c.w, 3, 3, 10, 5); px(g, c.w, 5, 1, 6, 3); px(g, c.w, 4, 10, 2, 2); px(g, c.w, 8, 12, 2, 2); px(g, c.w, 11, 10, 2, 2); },
  cloud: (g, c) => { px(g, c.w, 2, 6, 12, 6); px(g, c.w, 4, 3, 5, 4); px(g, c.w, 8, 4, 5, 3); px(g, c.ink, 2, 11, 12, 1); },
  // 선물 상자 — 축하 팝업 (G46)
  // 재료 — 과일(둥근 열매+잎) · 기본(얼음/물 큐브) · 달콤(사탕) · 유제품(우유병) · 해산물(물고기) · 곡물(이삭) · 채소(잎) · 육류(고기) · 견과(껍질)
  fruit: (g, c) => { px(g, c.a, 4, 6, 8, 7); px(g, c.a, 3, 8, 10, 3); px(g, c.b, 7, 3, 2, 3); px(g, c.b, 9, 4, 3, 2); px(g, c.w, 5, 7, 2, 2); },
  base: (g, c) => { px(g, c.w, 3, 4, 10, 9); px(g, c.a, 4, 5, 8, 7); px(g, c.w, 5, 6, 2, 3); px(g, c.ink, 3, 12, 10, 1); },
  sweet: (g, c) => { px(g, c.a, 5, 5, 6, 6); px(g, c.b, 2, 6, 3, 4); px(g, c.b, 11, 6, 3, 4); px(g, c.w, 6, 6, 2, 2); px(g, c.ink, 7, 8, 2, 1); },
  dairy: (g, c) => { px(g, c.w, 5, 5, 6, 9); px(g, c.w, 6, 2, 4, 3); px(g, c.a, 5, 8, 6, 3); px(g, c.ink, 5, 13, 6, 1); },
  seafood: (g, c) => { px(g, c.a, 3, 6, 8, 5); px(g, c.a, 11, 5, 3, 7); px(g, c.w, 4, 7, 2, 2); px(g, c.b, 6, 6, 4, 1); px(g, c.ink, 12, 7, 1, 3); },
  grain: (g, c) => { px(g, c.b, 7, 3, 2, 11); px(g, c.a, 4, 4, 3, 2); px(g, c.a, 9, 4, 3, 2); px(g, c.a, 4, 7, 3, 2); px(g, c.a, 9, 7, 3, 2); px(g, c.w, 7, 3, 1, 1); },
  veg: (g, c) => { px(g, c.a, 3, 5, 10, 7); px(g, c.a, 5, 3, 6, 2); px(g, c.b, 7, 6, 2, 8); px(g, c.w, 4, 6, 2, 2); },
  meat: (g, c) => { px(g, c.a, 3, 5, 9, 7); px(g, c.w, 4, 6, 3, 2); px(g, c.b, 11, 4, 3, 3); px(g, c.b, 12, 10, 2, 3); px(g, c.ink, 3, 12, 9, 1); },
  nut: (g, c) => { px(g, c.b, 4, 4, 8, 4); px(g, c.a, 3, 7, 10, 6); px(g, c.w, 5, 8, 2, 2); px(g, c.ink, 3, 13, 10, 1); },
  gift: (g, c) => { px(g, c.a, 2, 6, 12, 8); px(g, c.b, 2, 5, 12, 2); px(g, c.w, 7, 5, 2, 9); px(g, c.w, 2, 8, 12, 1); px(g, c.b, 5, 2, 2, 3); px(g, c.b, 9, 2, 2, 3); px(g, c.ink, 2, 13, 12, 1); },
};

const urlCache = new Map<IconName, string>();

function iconUrl(name: IconName): string {
  const hit = urlCache.get(name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  if (g) {
    PAINT[name](g, { ink: cssVar('--icon-ink'), a: cssVar('--icon-a'), b: cssVar('--icon-b'), w: cssVar('--icon-w') });
  }
  const url = c.toDataURL();
  urlCache.set(name, url);
  return url;
}

export function iconEl(name: IconName, extraClass?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = extraClass ? `kicon ${extraClass}` : 'kicon';
  span.dataset['icon'] = name;
  span.setAttribute('aria-hidden', 'true');
  // 경로는 데이터라 인라인으로 남는다 — 크기·정렬은 style.css 의 .kicon 이 소유한다
  span.style.setProperty('--icon-art', `url("${iconUrl(name)}")`);
  return span;
}

export const ICON_NAMES: readonly IconName[] = Object.keys(PAINT) as IconName[];
