/**
 * 시설 도트 (G14) — `fac-sprites.ts` 의 템플릿을 발자국 다이아몬드 위에 앉힌다.
 * 캔버스 = footprintCanvas(w, d, bodyH), 앵커 bottom-center (iso.ts 규칙). 발밑엔 반투명 그림자 다이아몬드.
 * 그림 교체 지점: 나중에 PNG 아틀라스가 오면 같은 ID(`fac/{id}/{facing}`)로 provider 만 갈아 끼운다.
 */
import type { FacilityDef } from '../../data/schema.js';
import { footprintCanvas, tileOffsetInCanvas, tileRowSpan, TILE_H } from '../../render/iso.js';
import { cssVar } from '../../ui/tokens.js';
import { blit, flipX, mapWidth, type PixMap } from './pix.js';
import { ART, DEFAULT_BY_CLASS, ICONS, TEMPLATES, type FacTemplate , rigTemplate } from './fac-sprites.js';

/** 캔버스 높이 예산 (docs/pixel-style.md 실측: 1×1 시설은 타일 폭의 0.8~1.2 높이) */
export const BODY_H: Record<FacilityDef['class'], number> = { utility: 28, lounging: 16, restaurant: 34, attraction: 30, slide: 64, decor: 30, rig: 20 }; // P48-c: 기구는 물 위 낮은 그림(플로팅 패드 위)

export function facilityCanvasSize(def: FacilityDef, facing: 0 | 1): { w: number; h: number } {
  const w = facing === 1 ? def.d : def.w;
  const d = facing === 1 ? def.w : def.d;
  const c = footprintCanvas(w, d, BODY_H[def.class]);
  return { w: c.x, h: c.y };
}

/** 템플릿 + 간판 아이콘을 합친 맵 (아이콘의 '.' 은 바탕을 남긴다) */
function composeRows(tplRows: PixMap, icon: PixMap | undefined, at: { x: number; y: number } | undefined): PixMap {
  if (!icon || !at) return tplRows;
  const rows = tplRows.map((r) => [...r]);
  icon.forEach((ir, j) => {
    [...ir].forEach((ch, i) => {
      if (ch === '.') return;
      const row = rows[at.y + j];
      if (row && at.x + i < row.length) row[at.x + i] = ch;
    });
  });
  return rows.map((r) => r.join(''));
}

export function drawFacility(def: FacilityDef, facing: 0 | 1): HTMLCanvasElement {
  const w = facing === 1 ? def.d : def.w;
  const d = facing === 1 ? def.w : def.d;
  const bodyH = BODY_H[def.class];
  const size = footprintCanvas(w, d, bodyH);
  const c = document.createElement('canvas');
  c.width = size.x;
  c.height = size.y;
  const g = c.getContext('2d');
  if (!g) return c;
  // 발밑 그림자 — 발자국 다이아몬드 (정수 스캔라인, 반투명)
  g.fillStyle = cssVar('--px-shadow');
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const o = tileOffsetInCanvas(i, j, d, bodyH);
      for (let y = 0; y < TILE_H; y++) {
        const s = tileRowSpan(y);
        g.fillRect(o.x + s.x0, o.y + y, s.x1 - s.x0, 1);
      }
    }
  }
  const art = ART[def.id] ?? (def.class === 'rig' ? rigTemplate(def) : DEFAULT_BY_CLASS[def.class]) ?? { tpl: 'bush' }; // P55: 기구는 모양(높이·길이)으로 폴백 셋
  const tpl = TEMPLATES[art.tpl] ?? TEMPLATES['bush'] as FacTemplate;
  let rows = composeRows(tpl.rows, art.icon ? ICONS[art.icon] : undefined, tpl.icon);
  if (facing === 1) rows = flipX(rows);
  const mw = mapWidth(rows);
  const x = Math.round(size.x / 2 - mw / 2);
  // 발자국 가운데 줄(=size.y − (w+d)·4) 보다 조금 아래에 밑변을 둔다 — 물체가 땅에 「앉아」 보인다
  const baseY = size.y - (w + d) * 4 + Math.round((w + d) * 2) + (tpl.dy ?? 0);
  const y = Math.max(0, baseY - rows.length);
  blit(g, rows, x, y, art.slots);
  return c;
}
