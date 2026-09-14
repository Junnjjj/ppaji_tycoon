/**
 * 풀 파생 상태 — 저장하지 않고 매번 센다. PSS 의 8지표: 크기·인기·유지비·색·향·강도·온도·SE/AB.
 *
 *   sizeScale = min(6, √size)                        (SE·AB 는 풀 크기에 비례 — 위키 "1×1 기준값")
 *   popularity = Σ tilePop + (colorBonus + scentBonus)[season] · size/4 + se·sizeScale + ab·sizeScale
 *   maintenance = base + popularity · perPop
 *   temp = ambient[season] + Σ item.tempDelta × min(1, 4/size) + Σ 인접 heat   (P52-c: 아이템 온도는 농도로)
 */
import type { FacilityDef, ItemDef, SeasonTables, Scent } from '../data/schema.js';
import type { Pool } from './pool.js';
import { mixColor, RAINBOW_COLORS, RAINBOW_MIN_SHARE, type PoolColorOrNone } from './color.js';
import type { PoolColor } from '../data/schema.js';
import { pickScent } from './scent.js';
import type { Season } from './clock.js';

export interface PoolContext {
  items: ReadonlyMap<string, ItemDef>;
  /** 이 풀에 인접한 시설 정의들 (같은 시설이 두 번 인접해도 한 번) */
  /** 인접 시설 — 슬라이드는 `landsHere`(출구가 이 풀) 일 때만 AB 를 준다 (G36) */
  adjacent: readonly (FacilityDef & { landsHere?: boolean })[];
  season: Season;
  tables: SeasonTables;
  balance: { poolMaintBase: number; poolMaintPerPop: number; tilePopStandard: number; tempFitRange?: number };
  /** 실내 풀인가 (전 타일이 실내 바닥 위) — G8 부터 `Game.poolIndoor` 가 준다 */
  indoor: boolean;
  /** 타일당 인기 합 (종류별) — 없으면 표준 × 크기 */
  tilePopSum?: number;
}

export interface PoolState {
  size: number;
  popularity: number;
  maintenance: number;
  color: PoolColorOrNone;
  intensity: number;
  scent: Scent | null;
  scentPower: number;
  temp: number;
  se: number;
  ab: number;
  seasonBonus: number;
  /** 풀 상세 (G42, 원작 풀 정보 창의 색·향·온도 탭) */
  detail: PoolDetail;
}

export interface PoolDetail {
  /** 색별 비중 */
  colorMix: { color: PoolColor; share: number }[];
  /** 농도 5칸 (원작: 색·향 칸 왼쪽 아래 세로 막대 5개) */
  intensityBars: number;
  /** 향의 출처 — 아이템이 시설을 이긴다(동점) */
  scentSource: 'item' | 'facility' | null;
  /** 이 계절의 이상 수온 · 얼마나 가까운가 (1 = 딱) */
  idealTemp: number;
  tempFit: number;
  /** 무지개까지 부족한 색 (비중 8% 미만) */
  missingForRainbow: PoolColor[];
}

export const SIZE_SCALE_CAP = 6;

export function sizeScale(size: number): number {
  return Math.min(SIZE_SCALE_CAP, Math.sqrt(Math.max(1, size)));
}

export function poolState(pool: Pool, ctx: PoolContext): PoolState {
  const size = pool.tiles.length;
  const defs = pool.items.map((it) => ctx.items.get(it.itemId)).filter((d): d is ItemDef => d !== undefined);
  const { color, intensity, shares } = mixColor(defs.map((d) => ({ color: d.color, weight: d.colorWeight })), size);
  const scentPick = pickScent([
    ...defs.map((d) => ({ scent: d.scent, power: d.scentPower, fromItem: true })),
    ...ctx.adjacent.map((f) => ({ scent: f.scent, power: f.scentPower, fromItem: false })),
  ]);
  const ambient = ctx.indoor ? ctx.tables.ambientIndoor : (ctx.tables.ambientOutdoor[ctx.season] ?? 24);
  // P52-c: 아이템 온도는 농도(4칸당 1개 = 원작 규격)로 — 20칸에 딸기 5개는 4칸에 1개와 같은 −2. 칸 수와 무관한 합이면 큰 빠지의 색을 맞추는 순간 물이 14°C 가 돼 아무도 사진을 안 찍었다(G4 실측)
  const tempScale = Math.min(1, 4 / Math.max(1, size));
  const temp = Math.max(0, Math.min(50, ambient + defs.reduce((s, d) => s + d.tempDelta, 0) * tempScale + ctx.adjacent.reduce((s, f) => s + f.heat, 0)));
  const scale = sizeScale(size);
  const sun = ctx.indoor ? 0 : (ctx.tables.sun[ctx.season] ?? 0);
  // 좋아요 → SE 는 제곱근에 상한 10 — 선형이면 「좋아요 → 인기 → 글 좋아요」 고리가 폭주한다 (봇 실측 1,690만)
  const se = (sun + ctx.adjacent.reduce((s, f) => s + f.se, 0)) * scale + Math.min(10, Math.sqrt(Math.max(0, pool.likes)) / 3);
  const ab = ctx.adjacent.filter((f) => f.sprays || (f.slide !== null && f.landsHere === true)).reduce((s, f) => s + f.ab, 0) * scale;
  const colorBonus = ctx.tables.colors[color]?.[ctx.season] ?? 0;
  const scentBonus = scentPick.scent ? (ctx.tables.scents[scentPick.scent]?.[ctx.season] ?? 0) : 0;
  const seasonBonus = colorBonus + scentBonus;
  const tilePop = ctx.tilePopSum ?? size * ctx.balance.tilePopStandard;
  const popularity = Math.round(tilePop + (seasonBonus * size) / 4 + se + ab);
  const maintenance = ctx.balance.poolMaintBase + popularity * ctx.balance.poolMaintPerPop;
  const idealTemp = ctx.indoor ? (ctx.tables.idealIndoor ?? 28) : (ctx.tables.idealTemp?.[ctx.season] ?? 26);
  const range = ctx.balance.tempFitRange ?? 10;
  const tempFit = Math.max(0, Math.min(1, 1 - Math.abs(temp - idealTemp) / range));
  const colorMix = (Object.entries(shares) as [PoolColor, number][]).filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1]).map(([c, share]) => ({ color: c, share }));
  const missingForRainbow = color === 'rainbow' ? [] : RAINBOW_COLORS.filter((c) => (shares[c] ?? 0) < RAINBOW_MIN_SHARE);
  // 농도 = 강도 × 주된 색의 비중 — 원작: 「競合する色があると濃度が下がる」. 무지개는 비중을 안 곱한다
  const dominant = color === 'rainbow' ? 1 : (colorMix[0]?.share ?? 1);
  const detail: PoolDetail = {
    colorMix,
    intensityBars: Math.max(0, Math.min(5, Math.round((intensity * dominant) / 20))),
    scentSource: scentPick.scent ? (scentPick.fromItem ? 'item' : 'facility') : null,
    idealTemp, tempFit, missingForRainbow,
  };
  return { size, popularity, maintenance, color, intensity, scent: scentPick.scent, scentPower: scentPick.power, temp, se, ab, seasonBonus, detail };
}
