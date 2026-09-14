/**
 * 손님 대사 템플릿 (G27) — 친구 첫 방문 인사. 71명분을 손으로 쓰지 않고 **템플릿 6종 × 취향 삽입**으로 만든다.
 * 결정론: 템플릿은 id 해시로 고른다 (난수 0).
 */
import type { FriendDef } from '../data/schema.js';

export const COLOR_KO: Record<string, string> = { orange: '주황', yellow: '노랑', lime: '라임', green: '초록', blue: '파랑', purple: '보라', pink: '핑크', red: '빨강', white: '흰색', rainbow: '무지개', clear: '맑음' };
export const SCENT_KO: Record<string, string> = { citrus: '시트러스', floral: '꽃', pine: '솔', fruity: '과일', tropical: '트로피컬', berry: '베리', marine: '바다', cookie: '쿠키', spices: '향신료', milky: '우유', coffee: '커피', money: '머니' };

const TEMPLATES: readonly ((f: FriendDef, color: string, scent: string) => string)[] = [
  (_f, color) => `처음 왔어요! ${color} 풀이 있으면 좋겠다~`,
  (_f, _c, scent) => `소문 듣고 왔어요. ${scent} 향 나는 풀, 여기 있나요?`,
  (f) => `${f.fav.food} 파는 데 있어요? 배고파요…`,
  (_f, color, scent) => `${color}색에 ${scent} 향이면 최고인데!`,
  (f) => `${f.name}이에요. 오늘부터 단골 할게요!`,
  (_f, color) => `우와, 여기가 그 풀장이구나. ${color} 풀에 뛰어들고 싶어!`,
];

export function templateIndex(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
  return h % TEMPLATES.length;
}

/** 첫 방문 인사 한 줄 — 취향(색·향·음식)이 반드시 들어간다 */
export function firstVisitLine(f: FriendDef): string {
  const t = TEMPLATES[templateIndex(f.id)] ?? TEMPLATES[0]!;
  return t(f, COLOR_KO[f.fav.color] ?? f.fav.color, SCENT_KO[f.fav.scent] ?? f.fav.scent);
}
