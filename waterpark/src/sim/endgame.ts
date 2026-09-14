/**
 * 엔딩 — 8년차 겨울이 끝나면 점수. PSS 식 그대로:
 *   인기×10 + 총방문×1 + 총좋아요×1 + SNS친구×10 + 인증합격×10 + 레시피×5
 * 뉴게임+ 이월: 레시피+요리 EXP · 해금 시설 종류 각 1 · 선물 · 티켓가 ×0.3 (10 단위 내림). 돈·아이템·풀·손님·지역은 안 넘어간다.
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
  version: 1;
  recipes: string[];
  cookingExp: number;
  facilities: string[];
  gifts: string[];
  tiles: string[];
  ticketBase: number;
  bestScore: number;
  runs: number;
}

export function carryoverOf(g: Game, prev: Carryover | null): Carryover {
  const score = scoreOf(g).total;
  return {
    version: 1,
    recipes: [...g.cooking.known].sort(),
    cookingExp: g.cooking.exp,
    facilities: [...g.unlocked.facilities].sort(),
    gifts: [...g.unlocked.gifts].sort(),
    tiles: [...g.unlocked.tiles].sort(),
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
  for (const id of c.tiles) g.unlocked.tiles.add(id);
  g.ticketBonus = Math.max(0, c.ticketBase - g.b.ticketBase);
}
