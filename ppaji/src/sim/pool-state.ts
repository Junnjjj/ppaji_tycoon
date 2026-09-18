/**
 * 풀 파생 상태 — 저장하지 않고 매번 센다. 크기·인기·유지비·온도·SE/AB.
 * P60-a (D71): 색·향·소품은 게임에서 뺐다 — 계절 수온(temp·idealTemp·tempFit)만 남는다 (P52-c 야외 입수·사철 인증의 뿌리).
 *
 *   sizeScale = min(6, √size)                        (SE·AB 는 풀 크기에 비례 — 위키 "1×1 기준값")
 *   popularity = Σ tilePop + seasonBonus · size/4 + se·sizeScale + ab·sizeScale
 *   maintenance = base + popularity · perPop
 *   temp = ambient[season] + Σ 인접 heat   (족욕·사우나의 heat)
 */
import type { FacilityDef, SeasonTables } from '../data/schema.js';
import type { Pool } from './pool.js';
import type { Season } from './clock.js';

export interface PoolContext {
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
  temp: number;
  se: number;
  ab: number;
  /** 계절 인기 보너스 — P60-a 뒤로는 색·향이 없어 0 (자리는 남긴다: 계절 수온 축이 여기 얹힐 수 있다) */
  seasonBonus: number;
  /** 풀 상세 — 계절 이상 수온 (G42 → P60-a 온도만) */
  detail: PoolDetail;
}

export interface PoolDetail {
  /** 이 계절의 이상 수온 · 얼마나 가까운가 (1 = 딱) */
  idealTemp: number;
  tempFit: number;
}

export const SIZE_SCALE_CAP = 6;

export function sizeScale(size: number): number {
  return Math.min(SIZE_SCALE_CAP, Math.sqrt(Math.max(1, size)));
}

export function poolState(pool: Pool, ctx: PoolContext): PoolState {
  const size = pool.tiles.length;
  const ambient = ctx.indoor ? ctx.tables.ambientIndoor : (ctx.tables.ambientOutdoor[ctx.season] ?? 24);
  const temp = Math.max(0, Math.min(50, ambient + ctx.adjacent.reduce((s, f) => s + f.heat, 0)));
  const scale = sizeScale(size);
  const sun = ctx.indoor ? 0 : (ctx.tables.sun[ctx.season] ?? 0);
  // 좋아요 → SE 는 제곱근에 상한 10 — 선형이면 「좋아요 → 인기 → 글 좋아요」 고리가 폭주한다 (봇 실측 1,690만)
  const se = (sun + ctx.adjacent.reduce((s, f) => s + f.se, 0)) * scale + Math.min(10, Math.sqrt(Math.max(0, pool.likes)) / 3);
  const ab = ctx.adjacent.filter((f) => f.sprays || (f.slide !== null && f.landsHere === true)).reduce((s, f) => s + f.ab, 0) * scale;
  const seasonBonus = 0;
  const tilePop = ctx.tilePopSum ?? size * ctx.balance.tilePopStandard;
  const popularity = Math.round(tilePop + (seasonBonus * size) / 4 + se + ab);
  const maintenance = ctx.balance.poolMaintBase + popularity * ctx.balance.poolMaintPerPop;
  const idealTemp = ctx.indoor ? (ctx.tables.idealIndoor ?? 28) : (ctx.tables.idealTemp?.[ctx.season] ?? 26);
  const range = ctx.balance.tempFitRange ?? 10;
  const tempFit = Math.max(0, Math.min(1, 1 - Math.abs(temp - idealTemp) / range));
  return { size, popularity, maintenance, temp, se, ab, seasonBonus, detail: { idealTemp, tempFit } };
}
