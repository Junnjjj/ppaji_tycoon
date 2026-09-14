/**
 * 빠지 기구 규칙 (P49-a1 §3.7 — 순수 · rng 0 · 저장 0).
 * 등급은 「무엇이 몇 개, 몇 종, 이어졌나, 불이 있나」로만 정한다. 문턱 5개는 코드, 인기 배율은 데이터(`balance.ppajiGradePopMul`).
 * a1 은 등급 함수와 상수만 냈고, P50-a 가 켜짐(`computeRigs`·`RigState`·`walkOn`)을 낸다 — 사슬 값(`chainScale`)은 P50-b1.
 */
import { Grid, FLOOR } from './grid.js';
import { FacilityStore, type PlacedFacility } from './facility.js';
import type { PoolStore } from './pool.js';
import balanceJson from '../data/balance.json';
export type PpajiGrade = 0 | 1 | 2 | 3 | 4;

/** 등급 3 의 최장 사슬 종 수 — 시작 `obstacle` 계열이 정확히 3종이라 「시작 해금만으로 도달 가능·도배로는 못 넘는」 최대값 */
export const CHAIN_KINDS_FOR_GRADE3 = 3;
/** 등급 이름 — 정보창·모달·조건 라벨이 같은 낱말을 쓴다 */
export const PPAJI_GRADE_NAMES: readonly string[] = ['수영 빠지', '놀이 빠지', '빠지', '대형 빠지', '시그니처 빠지'];

export function ppajiGrade(x: { n: number; kinds: number; chain: number; chainKinds: number; lights: number }): PpajiGrade {
  if (x.n >= 14 && x.kinds >= 6 && x.lights >= 1) return 4;
  if (x.n >= 9 && ((x.chain >= 4 && x.chainKinds >= CHAIN_KINDS_FOR_GRADE3) || x.kinds >= 5)) return 3;
  if (x.n >= 5 && x.kinds >= 3) return 2;
  if (x.n >= 2) return 1;
  return 0;
}

/** P50-a §3.7 — 켜짐 상태(파생 · 저장 0). `lit` = 켜진 물 위 기구 uid · `walkOn` = 그 발자국 마스크 · `byPool` = 수역 id → 켜진 물 위 기구 uid[] · 사슬 둘은 P50-b1 이 채운다(지금은 켜진 기구 1) */
export interface RigState {
  lit: Set<number>;
  chainLen: Map<number, number>;
  chainKinds: Map<number, number>;
  walkOn: Uint8Array;
  byPool: Map<number, number[]>;
}
/** 조준 미리보기용 가짜 인스턴스 — 저장소에 넣지 않는다 (uid 는 음수) */
export interface RigOverlay { uid: number; defId: string; i: number; j: number; facing: 0 | 1 }

/** P50-b1 R5 — 계열 연결은 **정원에만** `sqrt(len / base)`(상한 cap). base 2 · cap 2.0 은 데이터(`balance.ppajiChainBase`·`ppajiChainCap`, `zoneAreaScale` 선례) */
export const CHAIN_BASE: number = (balanceJson as { ppajiChainBase: number }).ppajiChainBase;
export const CHAIN_CAP: number = (balanceJson as { ppajiChainCap: number }).ppajiChainCap;
export function chainScale(len: number, base: number = CHAIN_BASE, cap: number = CHAIN_CAP): number {
  return Math.min(cap, Math.max(1, Math.sqrt(len / base)));
}
/** 계열 셋 — 시작 기구 8 중 6 이 어느 계열에 든다 (`facilities.json` 의 `chain`) */
export const CHAIN_KINDS: readonly string[] = ['obstacle', 'slide', 'rest'];

export const EMPTY_RIG_STATE = (): RigState => ({ lit: new Set(), chainLen: new Map(), chainKinds: new Map(), walkOn: new Uint8Array(0), byPool: new Map() });

/**
 * R4 **켜짐 = 연결**: 링(데크)에 4이웃으로 닿은 물 위 기구가 씨앗, 켜진 기구끼리 4이웃 BFS. 안 닿으면 꺼짐(회색·이용 0).
 * 순수 · rng 0 · 저장 0 — `overlay` 는 조준 미리보기의 가짜 인스턴스(저장소 무변경).
 */
export function computeRigs(grid: Grid, facilities: FacilityStore, pools: Pick<PoolStore, 'ownerIdAt'>, overlay?: RigOverlay): RigState {
  const w = grid.w;
  const rigs: { uid: number; defId: string; chain: string | null; fp: { i: number; j: number }[] }[] = [];
  const consider = (f: Pick<PlacedFacility, 'uid' | 'defId' | 'i' | 'j' | 'facing'>): void => {
    const def = facilities.defById(f.defId);
    if (!def || def.class !== 'rig' || def.onRing === true) return;
    rigs.push({ uid: f.uid, defId: f.defId, chain: def.chain ?? null, fp: FacilityStore.footprint(def, f.i, f.j, f.facing) });
  };
  for (const f of facilities.all) consider(f);
  if (overlay) consider(overlay);
  const tileOf = new Map<number, number>(); // k → rigs index
  rigs.forEach((r, idx) => { for (const t of r.fp) tileOf.set(t.j * w + t.i, idx); });
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const litIdx = new Set<number>();
  const queue: number[] = [];
  rigs.forEach((r, idx) => {
    const seed = r.fp.some((t) => N4.some(([a, b]) => grid.inside(t.i + a, t.j + b) && grid.at(t.i + a, t.j + b) === FLOOR.deck));
    if (seed) { litIdx.add(idx); queue.push(idx); }
  });
  while (queue.length) {
    const idx = queue.shift() as number;
    for (const t of (rigs[idx] as { fp: { i: number; j: number }[] }).fp) for (const [a, b] of N4) {
      const o = tileOf.get((t.j + b) * w + t.i + a);
      if (o !== undefined && !litIdx.has(o)) { litIdx.add(o); queue.push(o); }
    }
  }
  const st = EMPTY_RIG_STATE();
  st.walkOn = new Uint8Array(w * grid.h);
  // P50-b1 R5 — 사슬: 켜진 기구 중 **같은 계열**끼리 4이웃 컴포넌트. chainLen = 컴포넌트 크기, chainKinds = 그 안의 종 수. 계열 없는 기구는 1·1
  const comp = new Map<number, number>(); // idx → 컴포넌트 번호
  const compLen = new Map<number, number>(), compKinds = new Map<number, number>();
  let nComp = 0;
  for (const s0 of litIdx) {
    if (comp.has(s0)) continue;
    const kind = (rigs[s0] as { chain: string | null }).chain;
    const id = nComp++; const members: number[] = [s0]; comp.set(s0, id);
    if (kind !== null) for (let q = 0; q < members.length; q++) {
      const cur = rigs[members[q] as number] as { fp: { i: number; j: number }[] };
      for (const t of cur.fp) for (const [a, b] of N4) {
        const o = tileOf.get((t.j + b) * w + t.i + a);
        if (o === undefined || comp.has(o) || !litIdx.has(o) || (rigs[o] as { chain: string | null }).chain !== kind) continue;
        comp.set(o, id); members.push(o);
      }
    }
    compLen.set(id, members.length);
    compKinds.set(id, new Set(members.map((m) => (rigs[m] as { defId: string }).defId)).size);
  }
  for (const idx of litIdx) {
    const r = rigs[idx] as { uid: number; fp: { i: number; j: number }[] };
    const cid = comp.get(idx) as number;
    st.lit.add(r.uid);
    st.chainLen.set(r.uid, compLen.get(cid) ?? 1);
    st.chainKinds.set(r.uid, compKinds.get(cid) ?? 1);
    for (const t of r.fp) st.walkOn[t.j * w + t.i] = 1;
    // 소속 수역 — 발자국 칸 수 최다, 동점은 id 작은 쪽
    const cnt = new Map<number, number>();
    for (const t of r.fp) { const id = pools.ownerIdAt(t.i, t.j); if (id >= 0) cnt.set(id, (cnt.get(id) ?? 0) + 1); }
    let best = -1, bestN = 0;
    for (const [id, n] of cnt) if (n > bestN || (n === bestN && id < best)) { best = id; bestN = n; }
    if (best >= 0) { const arr = st.byPool.get(best) ?? []; arr.push(r.uid); st.byPool.set(best, arr); }
  }
  return st;
}
