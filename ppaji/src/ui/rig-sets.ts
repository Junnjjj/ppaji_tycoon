/**
 * 세트 도감 헬퍼 (P60-c D72 B) — `rig-sets.json` 을 UI 가 읽는 한 자리. 판정은 sim(`computeRigs` → `game.setsOf`) 이 하고,
 * 여기는 **역색인**(시설 → 어느 세트의 멤버인가)과 **이름표**(hidden 세트는 발견 전 「?」)만 낸다.
 * 순수 함수는 `sets` 를 인자로 받는다 — 검사가 픽스처를 넣을 수 있게(JSON 은 과제 S 가 만든다).
 */
import rigSetsJson from '../data/rig-sets.json';

export interface RigSetLike {
  id: string;
  name: string;
  members: readonly string[];
  hidden?: boolean;
}

export const RIG_SETS: readonly RigSetLike[] = rigSetsJson as readonly RigSetLike[];

/** 발견 전 hidden 세트의 이름표 — 「어디서도 안 알려 준다」(§10.3) */
export const HIDDEN_SET_LABEL = '?';

/** 시설 id → 그 시설이 멤버인 세트들. 개조판은 호출부가 원종(`baseKind`)으로 바꿔 넣는다 */
export function setsByMember(sets: readonly RigSetLike[] = RIG_SETS): Map<string, RigSetLike[]> {
  const m = new Map<string, RigSetLike[]>();
  for (const s of sets) for (const id of s.members) { const arr = m.get(id) ?? []; arr.push(s); m.set(id, arr); }
  return m;
}

/** 건설 카드 배지용 — hidden 세트의 멤버십은 배지로도 새지 않는다 */
export function visibleSetsOf(facilityId: string, index: Map<string, RigSetLike[]> = setsByMember()): RigSetLike[] {
  return (index.get(facilityId) ?? []).filter((s) => !s.hidden);
}

export function rigSetById(id: string, sets: readonly RigSetLike[] = RIG_SETS): RigSetLike | undefined {
  return sets.find((s) => s.id === id);
}

/** 이름표 하나 — hidden 이고 아직 안 본 세트는 「?」. 모르는 id 는 그대로(과제 S 가 이름을 넘겨도 깨지지 않게) */
export function rigSetLabel(idOrName: string, seen: ReadonlySet<string>, sets: readonly RigSetLike[] = RIG_SETS): string {
  const s = rigSetById(idOrName, sets);
  if (!s) return idOrName;
  return s.hidden && !seen.has(s.id) ? HIDDEN_SET_LABEL : s.name;
}
