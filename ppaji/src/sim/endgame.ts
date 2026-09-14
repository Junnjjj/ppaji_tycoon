/**
 * 엔딩 — 8년차 겨울이 끝나면 점수. PSS 식 그대로:
 *   인기×10 + 총방문×1 + 총좋아요×1 + SNS친구×10 + 인증합격×10 + 레시피×5
 * 뉴게임+ 이월: 레시피+요리 EXP · 해금 시설 종류 각 1 · 선물 · **기구+공방 EXP(P11)** · 티켓가 ×0.3 (10 단위 내림). 돈·소품·수역·손님·출신지는 안 넘어간다.
 */
import type { Game } from './game.js';

export interface ScoreBreakdown {
  popularity: number;
  visitors: number;
  likes: number;
  friends: number;
  certs: number;
  recipes: number;
  total: number;
}

export const SCORE_WEIGHTS = { popularity: 10, visitors: 1, likes: 1, friends: 10, certs: 10, recipes: 5 } as const;

export function scoreOf(g: Game): ScoreBreakdown {
  const popularity = g.parkPopularity() * SCORE_WEIGHTS.popularity;
  const visitors = g.stats.visitors * SCORE_WEIGHTS.visitors;
  const likes = g.sns.totalLikes * SCORE_WEIGHTS.likes;
  const friends = g.sns.unlockedFriends.length * SCORE_WEIGHTS.friends;
  const certs = g.certs.passes() * SCORE_WEIGHTS.certs;
  const recipes = g.cooking.known.size * SCORE_WEIGHTS.recipes;
  return { popularity, visitors, likes, friends, certs, recipes, total: popularity + visitors + likes + friends + certs + recipes };
}

/** 회차당 티켓 가산 — 기본가의 30% 를 10 단위로 내림 */
export const NG_TICKET_STEP = (base: number): number => Math.floor((base * 0.3) / 10) * 10;

/** 뉴게임+ 프로필 — 세이브와 별도 키에 산다 */
export interface Carryover {
  /** 1 = P11 까지 · 2 = P53-b(개조 도감·부품·기구 EXP) */
  version: 1 | 2;
  recipes: string[];
  cookingExp: number;
  facilities: string[];
  gifts: string[];
  /** P49-a2 — 옛 이월에만 있다(물빛 삭제). 읽고 버린다 */
  tiles?: string[];
  ticketBase: number;
  bestScore: number;
  runs: number;
  /** P11 — 공방에서 만든 기구와 공방 EXP 도 넘어간다 (옛 프로필엔 없다) */
  gears?: string[];
  workshopExp?: number;
  /** P53-b v2 — 개조 도감(레시피 id)·개조 EXP·가진 부품. NG+ 첫 화면에 개조판 한 채가 선다(`Game.placeNgPlusRig`) */
  rigUpgrades?: string[];
  rigExp?: number;
  rigParts?: string[];
}

export function carryoverOf(g: Game, prev: Carryover | null): Carryover {
  const score = scoreOf(g).total;
  return {
    version: 2,
    recipes: [...g.cooking.known].sort(),
    cookingExp: g.cooking.exp,
    facilities: [...g.unlocked.facilities].sort(),
    gifts: [...g.unlocked.gifts].sort(),
    gears: [...g.courses.ownedEquipment].sort(),
    workshopExp: g.workshop.exp,
    rigUpgrades: [...g.rigs.known].sort(),
    rigExp: g.rigs.exp,
    rigParts: [...g.rigs.owned].sort(),
    // 회차마다 +30% 씩 **누적** (G38 — 예전엔 prev 를 무시해 3회차도 2회차와 같았다). 5회차까지만 오른다
    ticketBase: Math.min(g.b.ticketBase + NG_TICKET_STEP(g.b.ticketBase) * 5, (prev?.ticketBase ?? g.b.ticketBase) + NG_TICKET_STEP(g.b.ticketBase)),
    bestScore: Math.max(prev?.bestScore ?? 0, score),
    runs: (prev?.runs ?? 0) + 1,
  };
}

/** 새 판에 이월을 적용한다 — 해금 집합·도감·EXP 만 (돈·풀은 새 판 그대로) */
export function applyCarryover(g: Game, c: Carryover): void {
  for (const id of c.recipes) if (g.cooking.recipes.has(id)) g.cooking.known.add(id);
  g.cooking.exp = Math.max(g.cooking.exp, c.cookingExp);
  for (const id of c.facilities) g.unlocked.facilities.add(id);
  for (const id of c.gifts) g.unlocked.gifts.add(id);
  // P49-a2: 옛 이월의 `tiles` 는 읽고 버린다
  for (const id of c.gears ?? []) g.courses.grantEquipment(id);
  g.workshop.exp = Math.max(g.workshop.exp, c.workshopExp ?? 0);
  // P53-b v2 — 개조 도감·EXP·부품 (v1 프로필엔 없다 — 그대로 지나간다)
  for (const id of c.rigUpgrades ?? []) if (g.rigs.recipes.has(id)) g.rigs.known.add(id);
  g.rigs.exp = Math.max(g.rigs.exp, c.rigExp ?? 0);
  for (const id of c.rigParts ?? []) g.rigs.grantIngredient(id);
  g.ticketBonus = Math.max(0, c.ticketBase - g.b.ticketBase);
  if ((c.rigUpgrades ?? []).length > 0) g.placeNgPlusRig(); // G8: 첫 화면에 지난 판의 개조판 한 채
}
