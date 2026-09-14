/**
 * 조건 DSL 평가기 — 소원·인증·랭크가 **이 하나**를 쓴다. 갈라지면 「소원으로는 되는데 심사로는
 * 안 되는」 판이 생긴다. 세계는 인터페이스(`ConditionWorld`)로 받아 sim 안 어디서든 평가할 수 있다.
 *
 * `progress` 는 0..1 — 인증의 부분 점수와 소원 화면의 진행률이 쓴다. 수치형은 `min(1, actual/need)`,
 * 존재형은 0/1, `count` 형은 `found/count`.
 */
import type { Condition, FacilityClass, PoolColor, Scent } from '../data/schema.js';

export interface PoolView {
  id: number;
  size: number;
  color: PoolColor | 'rainbow' | 'clear';
  scent: Scent | null;
  temp: number;
  likes: number;
  intensity: number;
  /** 농도 5칸 (G42) — 없으면 intensity 로 센다 */
  bars?: number;
  popularity: number;
  indoor: boolean;
  /** 인접한 시설 id 들 */
  adjacentFacilities: readonly string[];
  /** 지금 들어 있는 아이템 id 들 */
  items: readonly string[];
  /** 타일 종류별 칸 수 (G35) — 없으면 전부 표준으로 본다 */
  tiles?: Readonly<Record<string, number>>;
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
}

export interface Verdict {
  met: boolean;
  progress: number;
  actual: number;
  need: number;
  /** 사람이 읽는 조건 한 줄 (한국어) */
  label: string;
  /** 만점 조건 (G42, 원작: 색·향은 농도 100% 라야 만점) — 충족해도 농도만큼만 점수가 난다 */
  full?: { actual: number; need: number; label: string };
}

const COLOR_KO: Record<string, string> = { orange: '주황', yellow: '노랑', lime: '라임', green: '초록', blue: '파랑', purple: '보라', pink: '핑크', red: '빨강', white: '흰', rainbow: '무지개' };
const TILE_KO: Record<string, string> = { standard: '표준', pink: '핑크', yellow: '노랑', blue: '파랑', wooden: '나무', stone: '돌', sandy: '모래', simple: '심플', granite: '화강암', cheerful: '명랑', excellent: '최고급', colorful: '컬러풀', kairo: '카이로' };
const SCENT_KO: Record<string, string> = { citrus: '시트러스', floral: '꽃', pine: '솔', fruity: '과일', tropical: '트로피컬', berry: '베리', marine: '바다', cookie: '쿠키', spices: '향신료', milky: '우유', coffee: '커피', money: '머니' };
const CLASS_KO: Record<FacilityClass, string> = { utility: '편의', lounging: '라운지', restaurant: '식당', attraction: '놀이', slide: '슬라이드', decor: '장식' };

const ratio = (actual: number, need: number): number => (need <= 0 ? 1 : Math.max(0, Math.min(1, actual / need)));

function poolMatches(p: PoolView, c: Extract<Condition, { kind: 'pool' }>): boolean {
  if (c.sizeMin !== undefined && p.size < c.sizeMin) return false;
  if (c.sizeMax !== undefined && p.size > c.sizeMax) return false;
  if (c.color !== undefined && p.color !== c.color) return false;
  if (c.scent !== undefined && p.scent !== c.scent) return false;
  if (c.tempMin !== undefined && p.temp < c.tempMin) return false;
  if (c.tempMax !== undefined && p.temp > c.tempMax) return false;
  if (c.likesMin !== undefined && p.likes < c.likesMin) return false;
  if (c.intensityMin !== undefined && p.intensity < c.intensityMin) return false;
  if (c.popMin !== undefined && p.popularity < c.popMin) return false;
  if (c.outdoor === true && p.indoor) return false;
  if (c.indoor === true && !p.indoor) return false;
  if (c.tile !== undefined && ((p.tiles ?? {})[c.tile] ?? 0) * 2 < p.size) return false;
  return true;
}

/** 풀 조건의 부분 진행 — 조건 항목 중 몇 개를 가장 잘 맞는 풀이 만족하나 */
function poolProgress(pools: readonly PoolView[], c: Extract<Condition, { kind: 'pool' }>): number {
  const checks: ((p: PoolView) => number)[] = [];
  if (c.sizeMin !== undefined) checks.push((p) => ratio(p.size, c.sizeMin as number));
  if (c.sizeMax !== undefined) checks.push((p) => (p.size <= (c.sizeMax as number) ? 1 : 0));
  if (c.color !== undefined) checks.push((p) => (p.color === c.color ? 1 : 0));
  if (c.scent !== undefined) checks.push((p) => (p.scent === c.scent ? 1 : 0));
  if (c.tempMin !== undefined) checks.push((p) => ratio(p.temp, c.tempMin as number));
  if (c.tempMax !== undefined) checks.push((p) => (p.temp <= (c.tempMax as number) ? 1 : 0));
  if (c.likesMin !== undefined) checks.push((p) => ratio(p.likes, c.likesMin as number));
  if (c.intensityMin !== undefined) checks.push((p) => ratio(p.intensity, c.intensityMin as number));
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
  if (c.color) parts.push(`${COLOR_KO[c.color] ?? c.color} 풀`);
  if (c.scent) parts.push(`${SCENT_KO[c.scent] ?? c.scent} 향`);
  if (c.sizeMin !== undefined) parts.push(`${c.sizeMin}칸 이상`);
  if (c.sizeMax !== undefined) parts.push(`${c.sizeMax}칸 이하`);
  if (c.tempMin !== undefined) parts.push(`${c.tempMin}°C 이상`);
  if (c.tempMax !== undefined) parts.push(`${c.tempMax}°C 이하`);
  if (c.likesMin !== undefined) parts.push(`좋아요 ${c.likesMin}+`);
  if (c.intensityMin !== undefined) parts.push(`강도 ${c.intensityMin}+`);
  if (c.popMin !== undefined) parts.push(`인기 ${c.popMin}+`);
  if (c.tile !== undefined) parts.push(`${TILE_KO[c.tile] ?? c.tile} 타일 절반 이상`);
  const body = parts.length ? parts.join(' · ') : '풀';
  return (c.count ?? 1) > 1 ? `${body} ×${c.count}` : body;
}

export function evaluate(c: Condition, w: ConditionWorld, names: { facility: (id: string) => string; item: (id: string) => string; gift: (id: string) => string } = { facility: (s) => s, item: (s) => s, gift: (s) => s }): Verdict {
  switch (c.kind) {
    case 'pool': {
      const need = c.count ?? 1;
      const pools = w.pools();
      const matching = pools.filter((p) => poolMatches(p, c));
      const found = matching.length;
      let progress = found >= need ? 1 : Math.max(found / need, poolProgress(pools, c) * (need === 1 ? 1 : 1 / need) + found / need);
      // 색·향 조건: 충족해도 농도(0~5칸)가 만점을 정한다 — 원작 「濃度を100%にすると満点」
      let full: Verdict['full'];
      if (c.color !== undefined || c.scent !== undefined) {
        const bars = found > 0 ? Math.max(...matching.map((p) => p.bars ?? Math.max(0, Math.min(5, Math.round(p.intensity / 20))))) : 0;
        full = { actual: bars, need: 5, label: '농도' };
        if (found >= need) progress = 0.6 + 0.4 * (bars / 5);
      }
      return full ? { met: found >= need, progress: Math.min(1, progress), actual: found, need, label: poolLabel(c), full } : { met: found >= need, progress: Math.min(1, progress), actual: found, need, label: poolLabel(c) };
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
    case 'item': {
      const need = c.count ?? 1;
      const found = w.pools().reduce((s, p) => s + p.items.filter((it) => it === c.id).length, 0);
      return { met: found >= need, progress: ratio(found, need), actual: found, need, label: `풀에 ${names.item(c.id)}${need > 1 ? ` ×${need}` : ''}` };
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
  'pool', 'poolTotalSize', 'facility', 'facilityAdjacent', 'facilityClass', 'item', 'recipe', 'recipeCount', 'popularity', 'likes',
  'certPasses', 'certPassed', 'friends', 'areas', 'rank', 'gift', 'cookingLevel', 'visitors', 'money', 'year', 'all', 'any',
];
