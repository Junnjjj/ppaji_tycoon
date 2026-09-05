/**
 * 손님 대사 템플릿 (G27) — 친구 첫 방문 인사. 71명분을 손으로 쓰지 않고 **템플릿 6종 × 취향 삽입**으로 만든다.
 * 결정론: 템플릿은 id 해시로 고른다 (난수 0).
 */
import type { FriendDef } from '../data/schema.js';

export const COLOR_KO: Record<string, string> = { orange: '노을빛', yellow: '햇살빛', lime: '연둣빛', green: '초록빛', blue: '쪽빛', purple: '보랏빛', pink: '핑크빛', red: '붉은빛', white: '은빛', rainbow: '오색빛', clear: '맑음' }; // P3: 색 → 물빛
export const SCENT_KO: Record<string, string> = { citrus: '상큼', floral: '꽃내음', pine: '솔내음', fruity: '과일향', tropical: '트로피컬', berry: '베리향', marine: '강바람', cookie: '군것질', spices: '매콤', milky: '우유빛', coffee: '커피향', money: '돈냄새' }; // P3: 향 → 분위기

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
