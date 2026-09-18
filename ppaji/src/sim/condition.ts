/**
 * 조건 DSL 평가기 — 소원·인증·랭크가 **이 하나**를 쓴다. 갈라지면 「소원으로는 되는데 심사로는
 * 안 되는」 판이 생긴다. 세계는 인터페이스(`ConditionWorld`)로 받아 sim 안 어디서든 평가할 수 있다.
 *
 * `progress` 는 0..1 — 인증의 부분 점수와 소원 화면의 진행률이 쓴다. 수치형은 `min(1, actual/need)`,
 * 존재형은 0/1, `count` 형은 `found/count`.
 */
import type { Condition, FacilityClass } from '../data/schema.js';

export interface PoolView {
  id: number;
  size: number;
  temp: number;
  likes: number;
  popularity: number;
  indoor: boolean;
  /** 인접한 시설 id 들 */
  adjacentFacilities: readonly string[];
}

export interface FacilityView {
  uid: number;
  id: string;
  class: FacilityClass;
  /** 풀에 인접한가 */
  adjacentPool: boolean;
  /** 인접한 다른 시설 id 들 */
  adjacentFacilities: readonly string[];
}

/** P49-a1 — 조건 DSL 이 보는 기구 한 줄 */
export interface RigView { id: string; depth: 'shallow' | 'deep' | 'any'; chain: string | null; guarded: boolean }

export interface ConditionWorld {
  pools(): readonly PoolView[];
  facilities(): readonly FacilityView[];
  popularity(): number;
  likes(scope: 'total' | 'area', area?: string): number;
  certPasses(): number;
  certPassed(id: string): boolean;
  friends(): number;
  areas(): number;
  rank(): number;
  hasGift(id: string, friendId?: string): boolean;
  recipeKnown(id: string, served: boolean): boolean;
  recipeCount(): number;
  cookingLevel(): number;
  visitors(): number;
  money(): number;
  year(): number;
  /** 놓인 코스들의 스릴 (P6) */
  courseThrills(): readonly number[];
  /** P49-a1 — 수역별 빠지 등급 0~4 · 수역별 최장 사슬(a1 은 0) · 기구 목록 */
  ppajiGrades(): readonly number[];
  rigChains(): readonly number[];
  rigs(): readonly RigView[];
  /** P60-c — 수역별 성립 세트 수 (optional: 검사용 가짜 세계는 안 낸다 → 0) */
  rigSets?(): readonly number[];
  /** P28 자리 등급들 (0~5) · 시설 id 가 먹여 주는 자리 수의 최대값 */
  seatGrades(): readonly number[];
  seatsFedMax(id: string): number;
}

export interface Verdict {
  met: boolean;
  progress: number;
  actual: number;
  need: number;
  /** 사람이 읽는 조건 한 줄 (한국어) */
  label: string;
}

const CLASS_KO: Record<FacilityClass, string> = { utility: '편의', lounging: '라운지', restaurant: '식당', attraction: '놀이', slide: '슬라이드', decor: '장식', rig: '기구' };

const ratio = (actual: number, need: number): number => (need <= 0 ? 1 : Math.max(0, Math.min(1, actual / need)));

function poolMatches(p: PoolView, c: Extract<Condition, { kind: 'pool' }>): boolean {
  if (c.sizeMin !== undefined && p.size < c.sizeMin) return false;
  if (c.sizeMax !== undefined && p.size > c.sizeMax) return false;
  if (c.tempMin !== undefined && p.temp < c.tempMin) return false;
  if (c.tempMax !== undefined && p.temp > c.tempMax) return false;
  if (c.likesMin !== undefined && p.likes < c.likesMin) return false;
  if (c.popMin !== undefined && p.popularity < c.popMin) return false;
  if (c.outdoor === true && p.indoor) return false;
  if (c.indoor === true && !p.indoor) return false;
  return true;
}

/** 풀 조건의 부분 진행 — 조건 항목 중 몇 개를 가장 잘 맞는 풀이 만족하나 */
function poolProgress(pools: readonly PoolView[], c: Extract<Condition, { kind: 'pool' }>): number {
  const checks: ((p: PoolView) => number)[] = [];
  if (c.sizeMin !== undefined) checks.push((p) => ratio(p.size, c.sizeMin as number));
  if (c.sizeMax !== undefined) checks.push((p) => (p.size <= (c.sizeMax as number) ? 1 : 0));
  if (c.tempMin !== undefined) checks.push((p) => ratio(p.temp, c.tempMin as number));
  if (c.tempMax !== undefined) checks.push((p) => (p.temp <= (c.tempMax as number) ? 1 : 0));
  if (c.likesMin !== undefined) checks.push((p) => ratio(p.likes, c.likesMin as number));
  if (c.popMin !== undefined) checks.push((p) => ratio(p.popularity, c.popMin as number));
  if (c.outdoor === true) checks.push((p) => (p.indoor ? 0 : 1));
  if (c.indoor === true) checks.push((p) => (p.indoor ? 1 : 0));
  if (checks.length === 0) return pools.length > 0 ? 1 : 0;
  let best = 0;
  for (const p of pools) {
    const v = checks.reduce((s, f) => s + f(p), 0) / checks.length;
    if (v > best) best = v;
  }
  return best;
}

function poolLabel(c: Extract<Condition, { kind: 'pool' }>): string {
  const parts: string[] = [];
  if (c.outdoor) parts.push('야외');
  if (c.indoor) parts.push('실내');
  if (c.sizeMin !== undefined) parts.push(`${c.sizeMin}칸 이상`);
  if (c.sizeMax !== undefined) parts.push(`${c.sizeMax}칸 이하`);
  if (c.tempMin !== undefined) parts.push(`${c.tempMin}°C 이상`);
  if (c.tempMax !== undefined) parts.push(`${c.tempMax}°C 이하`);
  if (c.likesMin !== undefined) parts.push(`좋아요 ${c.likesMin}+`);
  if (c.popMin !== undefined) parts.push(`인기 ${c.popMin}+`);
  const body = parts.length ? parts.join(' · ') : '풀';
  return (c.count ?? 1) > 1 ? `${body} ×${c.count}` : body;
}

export function evaluate(c: Condition, w: ConditionWorld, names: { facility: (id: string) => string; gift: (id: string) => string } = { facility: (s) => s, gift: (s) => s }): Verdict {
  switch (c.kind) {
    case 'pool': {
      const need = c.count ?? 1;
      const pools = w.pools();
      const matching = pools.filter((p) => poolMatches(p, c));
      const found = matching.length;
      const progress = found >= need ? 1 : Math.max(found / need, poolProgress(pools, c) * (need === 1 ? 1 : 1 / need) + found / need);
      return { met: found >= need, progress: Math.min(1, progress), actual: found, need, label: poolLabel(c) };
    }
    case 'poolTotalSize': {
      const actual = w.pools().reduce((s, p) => s + p.size, 0);
      return { met: actual >= c.min, progress: ratio(actual, c.min), actual, need: c.min, label: `풀 합계 ${c.min}칸 이상` };
    }
    case 'facility': {
      const need = c.count ?? 1;
      const found = w.facilities().filter((f) => f.id === c.id && (!c.adjacentPool || f.adjacentPool)).length;
      return { met: found >= need, progress: ratio(found, need), actual: found, need, label: `${names.facility(c.id)}${c.adjacentPool ? ' (풀 옆)' : ''}${need > 1 ? ` ×${need}` : ''}` };
    }
    case 'facilityAdjacent': {
      const need = c.count ?? 1;
      const [a, b] = c.ids;
      const found = w.facilities().filter((f) => f.id === a && f.adjacentFacilities.includes(b)).length;
      return { met: found >= need, progress: ratio(found, need), actual: found, need, label: `${names.facility(a)} 옆에 ${names.facility(b)}${need > 1 ? ` ×${need}` : ''}` };
    }
    case 'facilityClass': {
      const need = c.count ?? 1;
      const found = w.facilities().filter((f) => f.class === c.class).length;
      return { met: found >= need, progress: ratio(found, need), actual: found, need, label: `${CLASS_KO[c.class]} 시설 ${need}개` };
    }
    case 'recipe': {
      const ok = w.recipeKnown(c.id, c.served ?? false);
      return { met: ok, progress: ok ? 1 : 0, actual: ok ? 1 : 0, need: 1, label: `요리 ${c.id}${c.served ? ' (메뉴에)' : ''}` };
    }
    case 'recipeCount': {
      const a = w.recipeCount();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `레시피 ${c.min}종` };
    }
    case 'popularity': {
      const a = w.popularity();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `인기도 ${c.min} 이상` };
    }
    case 'likes': {
      const a = w.likes(c.scope ?? 'total', c.area);
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `좋아요 ${c.min}` };
    }
    case 'certPasses': {
      const a = w.certPasses();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `인증 ${c.min}회` };
    }
    case 'certPassed': {
      const ok = w.certPassed(c.id);
      return { met: ok, progress: ok ? 1 : 0, actual: ok ? 1 : 0, need: 1, label: `인증 ${c.id} 통과` };
    }
    case 'friends': {
      const a = w.friends();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `SNS 친구 ${c.min}명` };
    }
    case 'areas': {
      const a = w.areas();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `지역 ${c.min}곳` };
    }
    case 'rank': {
      const a = w.rank();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `랭크 ★${c.min}` };
    }
    case 'gift': {
      const ok = w.hasGift(c.id, c.friendId);
      return { met: ok, progress: ok ? 1 : 0, actual: ok ? 1 : 0, need: 1, label: `선물 ${names.gift(c.id)}` };
    }
    case 'cookingLevel': {
      const a = w.cookingLevel();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `요리 Lv${c.min}` };
    }
    case 'visitors': {
      const a = w.visitors();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `누적 방문 ${c.min}명` };
    }
    case 'money': {
      const a = w.money();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `자금 ${c.min}G` };
    }
    case 'year': {
      const a = w.year();
      return { met: a >= c.min, progress: ratio(a, c.min), actual: a, need: c.min, label: `${c.min}년차` };
    }
    case 'rigGrade': {
      const need = c.count ?? 1; const gs = w.ppajiGrades(); const found = gs.filter((g) => g >= c.min).length; const best = gs.length ? Math.max(...gs) : 0;
      return { met: found >= need, progress: found >= need ? 1 : need === 1 ? ratio(best, c.min) : found / need, actual: found, need, label: `등급 ${c.min} 빠지 ${need}곳` };
    }
    case 'rigChain': {
      const need = c.count ?? 1; const cs = w.rigChains(); const found = cs.filter((n) => n >= c.min).length; const best = cs.length ? Math.max(...cs) : 0;
      return { met: found >= need, progress: found >= need ? 1 : need === 1 ? ratio(best, c.min) : found / need, actual: found, need, label: `기구 ${c.min}개 이어진 사슬 ${need}개` };
    }
    case 'rigCount': {
      const rs = w.rigs().filter((r) => !c.depth || c.depth === 'any' || r.depth === c.depth || r.depth === 'any');
      const kinds = new Set(rs.map((r) => r.id)).size; const okKinds = c.kinds === undefined || kinds >= c.kinds;
      return { met: rs.length >= c.min && okKinds, progress: Math.min(ratio(rs.length, c.min), c.kinds ? ratio(kinds, c.kinds) : 1), actual: rs.length, need: c.min, label: `${c.depth === 'shallow' ? '여울 ' : c.depth === 'deep' ? '깊은 물 ' : ''}기구 ${c.min}개${c.kinds ? ` · ${c.kinds}종` : ''}` };
    }
    case 'rigSet': {
      const ss = w.rigSets?.() ?? []; const best = ss.length ? Math.max(...ss) : 0;
      return { met: best >= c.min, progress: ratio(best, c.min), actual: best, need: c.min, label: `한 빠지에 기구 세트 ${c.min}개` };
    }
    case 'rigGuarded': {
      const rs = w.rigs(); const g = rs.filter((r) => r.guarded).length; const need = c.min ?? 1; const rat = rs.length ? g / rs.length : 0;
      const met = c.ratioMin !== undefined ? rat >= c.ratioMin && rs.length > 0 : g >= need;
      return { met, progress: c.ratioMin !== undefined ? ratio(rat, c.ratioMin) : ratio(g, need), actual: g, need: c.ratioMin !== undefined ? Math.ceil(c.ratioMin * Math.max(1, rs.length)) : need, label: c.ratioMin !== undefined ? `기구 ${Math.round(c.ratioMin * 100)}% 가 안전 반경 안` : `안전 반경 안 기구 ${need}개` };
    }
    case 'courseThrill': {
      const need = c.count ?? 1;
      const ts = w.courseThrills();
      const found = ts.filter((t) => t >= c.min).length;
      const best = ts.length ? Math.max(...ts) : 0;
      // 개수가 모자라면 「가장 스릴 있는 코스가 문턱에 얼마나 가까운가」로 부분 점수를 준다
      const progress = found >= need ? 1 : need === 1 ? ratio(best, c.min) : found / need;
      return { met: found >= need, progress, actual: found, need, label: `스릴 ${c.min} 이상 코스 ${need}개` };
    }
    case 'seatGrade': {
      const need = c.count ?? 1;
      const gs = w.seatGrades();
      const found = gs.filter((g) => g >= c.min).length;
      const best = gs.length ? Math.max(...gs) : 0;
      const progress = found >= need ? 1 : need === 1 ? ratio(best, c.min) : found / need;
      return { met: found >= need, progress, actual: found, need, label: `등급 ${c.min} 이상 자리 ${need}곳` };
    }
    case 'seatsFed': {
      const have = w.seatsFedMax(c.id);
      return { met: have >= c.count, progress: ratio(have, c.count), actual: have, need: c.count, label: `${names.facility(c.id)} 반경에 자리 ${c.count}곳` };
    }
    case 'all': {
      const vs = c.of.map((x) => evaluate(x, w, names));
      const met = vs.every((v) => v.met);
      const progress = vs.length ? vs.reduce((s, v) => s + v.progress, 0) / vs.length : 1;
      return { met, progress, actual: vs.filter((v) => v.met).length, need: vs.length, label: vs.map((v) => v.label).join(' + ') };
    }
    case 'any': {
      const vs = c.of.map((x) => evaluate(x, w, names));
      const met = vs.some((v) => v.met);
      const progress = vs.length ? Math.max(...vs.map((v) => v.progress)) : 1;
      return { met, progress, actual: met ? 1 : 0, need: 1, label: vs.map((v) => v.label).join(' 또는 ') };
    }
  }
}

/** 데이터 검사용 — 이 평가기가 아는 kind 전부 */
export const CONDITION_KINDS: readonly Condition['kind'][] = [
  'pool', 'poolTotalSize', 'facility', 'facilityAdjacent', 'facilityClass', 'recipe', 'recipeCount', 'popularity', 'likes',
  'certPasses', 'certPassed', 'friends', 'areas', 'rank', 'gift', 'cookingLevel', 'visitors', 'money', 'year', 'all', 'any',
];
