/**
 * 그림 등록부 (P56-a D1) — 정의 id 하나에 그림 하나. `pictures.json` 이 시트 좌표를 들고, 없으면 **계열 아이콘으로 폴백**한다.
 * Phase G 와 같은 규칙: 아틀라스는 픽셀만 준다, 없다고 화면이 깨지지 않는다. 호출부는 `pictureEl(id, fallback)` 하나만 안다 —
 * 그림이 오면(P56-b) `pictures.json` 만 채워지고 코드는 0줄 바뀐다.
 *
 *   id 형식: `pic/<kind>/<defId>` — kind = ingredient · recipe · part · gear · item · gift · band (주문서 `docs/assets/pipelines/ppaji-picture-sheet.md`)
 */
import picturesJson from '../data/pictures.json';
import { assetUrl } from './asset-url.js';
import { iconEl, type IconName } from './icons.js';

export interface PictureEntry { x: number; y: number; w?: number; h?: number }
export interface PictureSheet { sheet: string; cell: number; entries: Record<string, PictureEntry> }

let approvedPicture: ((id: string) => HTMLCanvasElement | null) | null = null;
export function setApprovedPictureSource(source: (id: string) => HTMLCanvasElement | null): void { approvedPicture = source; }

export const PICTURES: PictureSheet = picturesJson as PictureSheet;

export type PictureKind = 'ingredient' | 'recipe' | 'part' | 'gear' | 'item' | 'gift' | 'band' | 'campaign' | 'portrait'; // P56-b2: 캠페인 3 · 인물 초상 5×2

export function pictureId(kind: PictureKind, defId: string): string {
  return `pic/${kind}/${defId}`;
}

export function hasPicture(id: string): boolean {
  return Boolean(approvedPicture?.(id)) || Object.prototype.hasOwnProperty.call(PICTURES.entries, id);
}

/** 반입된 그림 수 — 하네스 「폴백 0」 행이 읽는다 */
export function pictureCount(): number {
  return Object.keys(PICTURES.entries).length;
}

/**
 * 그림 자리 하나. 시트에 있으면 `.kpic` 배경 스프라이트, 없으면 계열 아이콘(`.kicon`)에 `data-pic-fallback` 을 단다.
 * 좌표·크기는 데이터라 인라인 변수로 남는다 — 색·정렬은 style.css 의 `.kpic` 이 소유한다.
 */
export function pictureEl(id: string, fallback: IconName, extraClass?: string): HTMLSpanElement {
  const art = approvedPicture?.(id);
  if (art) { const span = canvasPictureEl(art, fallback, extraClass); span.dataset['pic'] = id; span.dataset['picSource'] = 'approved-asset'; return span; }
  const e = PICTURES.entries[id];
  if (!e) {
    const span = iconEl(fallback, extraClass ? `kpic-fb ${extraClass}` : 'kpic-fb');
    span.dataset['pic'] = id;
    span.dataset['picFallback'] = '1';
    return span;
  }
  const span = document.createElement('span');
  span.className = extraClass ? `kpic ${extraClass}` : 'kpic';
  span.dataset['pic'] = id;
  span.setAttribute('aria-hidden', 'true');
  span.style.setProperty('--pic-sheet', `url("${assetUrl(PICTURES.sheet)}")`); // P57-c: dist 에서 CSS 위치 기준으로 풀리던 상대 경로
  span.style.setProperty('--pic-x', `${-e.x}px`);
  span.style.setProperty('--pic-y', `${-e.y}px`);
  span.style.setProperty('--pic-w', `${e.w ?? PICTURES.cell}px`);
  span.style.setProperty('--pic-h', `${e.h ?? PICTURES.cell}px`);
  return span;
}

// Native authored frames include transparent camera guards. Crop only DOM thumbnails,
// keeping provider pixels and world anchors untouched.
const thumbnailBounds = new WeakMap<HTMLCanvasElement, { x: number; y: number; w: number; h: number }>();
function visibleBounds(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const cached = thumbnailBounds.get(canvas); if (cached) return cached;
  const ctx = canvas.getContext('2d');
  let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
  if (ctx) {
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (!rgba[(y * canvas.width + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const bounds = x1 < 0 ? { x: 0, y: 0, w: canvas.width, h: canvas.height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  thumbnailBounds.set(canvas, bounds); return bounds;
}

/** 캔버스(시설 스프라이트)를 그림 자리에 앉힌다 — 개조판·건설·투자·심사 보상은 그림이 이미 있다 */
export function canvasPictureEl(canvas: HTMLCanvasElement | null, fallback: IconName, extraClass?: string): HTMLSpanElement {
  if (!canvas) return iconEl(fallback, extraClass ? `kpic-fb ${extraClass}` : 'kpic-fb');
  const span = document.createElement('span');
  span.className = extraClass ? `kpic kpic-canvas ${extraClass}` : 'kpic kpic-canvas';
  span.setAttribute('aria-hidden', 'true');
  // Providers cache canvases; a DOM thumbnail must never steal another card's node.
  const b = visibleBounds(canvas);
  const copy = document.createElement('canvas'); copy.width = b.w; copy.height = b.h;
  copy.getContext('2d')?.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  span.append(copy);
  return span;
}
