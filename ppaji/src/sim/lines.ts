/**
 * 손님 대사 템플릿 (G27) — 친구 첫 방문 인사. 71명분을 손으로 쓰지 않고 **템플릿 6종 × 취향 삽입**으로 만든다.
 * 결정론: 템플릿은 id 해시로 고른다 (난수 0). P60-a: 색·향 취향은 뺐다 — 남는 취향은 음식(`fav.food`) 하나.
 */
import type { FriendDef } from '../data/schema.js';

const TEMPLATES: readonly ((f: FriendDef) => string)[] = [
  (f) => `처음 왔어요! ${f.fav.food} 파는 데가 있으면 좋겠다~`,
  () => `소문 듣고 왔어요. 강물이 그렇게 시원하다면서요?`,
  (f) => `${f.fav.food} 파는 데 있어요? 배고파요…`,
  (f) => `강바람에 ${f.fav.food}면 최고인데!`,
  (f) => `${f.name}이에요. 오늘부터 단골 할게요!`,
  () => `우와, 여기가 그 빠지구나. 강물에 뛰어들고 싶어!`,
];

export function templateIndex(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
  return h % TEMPLATES.length;
}

/** 첫 방문 인사 한 줄 — 취향(음식)이나 이름이 들어간다 */
export function firstVisitLine(f: FriendDef): string {
  const t = TEMPLATES[templateIndex(f.id)] ?? TEMPLATES[0]!;
  return t(f);
}
