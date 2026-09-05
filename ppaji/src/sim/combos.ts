/**
 * 인접 콤보 (P16, D24 ③ — 레거시 K8/P2 를 작게 이식): 두 시설이 radius 안에 있으면 발동한다.
 * 효과는 셋 — ① 두 시설을 쓰는 손님 만족 +sat ② 식당 쪽 판매가 +revenue% ③ 파크 인기 +2/콤보(소형 중복 허용).
 * 발견은 누적(`seen`, 스냅샷) — 첫 발동에 알림 한 줄. 정답표 대신 「매점 앞 평상」 같은 상식이 이름이다.
 */
import combosJson from '../data/combos.json';
import type { ComboDef } from '../data/schema.js';
import type { PlacedFacility } from './facility.js';

export const COMBO_DEFS = (combosJson as unknown as { combos: ComboDef[] }).combos;
export const COMBO_POP = 2;

export interface ActiveCombo { def: ComboDef; a: PlacedFacility; b: PlacedFacility }

/** 지금 발동 중인 콤보 — 같은 시설이 여러 콤보에 들 수 있다 (소형은 중복 허용) */
export function activeCombos(all: readonly PlacedFacility[], defOf: (f: PlacedFacility) => { w: number; d: number }): ActiveCombo[] {
  const byId = new Map<string, PlacedFacility[]>();
  for (const f of all) { const l = byId.get(f.defId); if (l) l.push(f); else byId.set(f.defId, [f]); }
  const near = (a: PlacedFacility, b: PlacedFacility, r: number): boolean => {
    const da = defOf(a), db = defOf(b);
    const gapI = Math.max(0, Math.max(a.i, b.i) - Math.min(a.i + da.w - 1, b.i + db.w - 1) - 0);
    const gapJ = Math.max(0, Math.max(a.j, b.j) - Math.min(a.j + da.d - 1, b.j + db.d - 1) - 0);
    return Math.max(gapI, gapJ) <= r;
  };
  const out: ActiveCombo[] = [];
  for (const def of COMBO_DEFS) {
    const as = byId.get(def.pair[0]) ?? [], bs = byId.get(def.pair[1]) ?? [];
    const used = new Set<number>();
    for (const a of as) for (const b of bs) {
      if (a.uid === b.uid || used.has(b.uid)) continue;
      if (near(a, b, def.radius)) { out.push({ def, a, b }); used.add(b.uid); break; }
    }
  }
  return out;
}
