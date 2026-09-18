/**
 * 빠지 기구 규칙 (P49-a1 §3.7 — 순수 · rng 0 · 저장 0).
 * 등급은 「무엇이 몇 개, 몇 종, 이어졌나, 불이 있나」로만 정한다. 문턱은 P60-d 부터 데이터(`balance.ppajiGradeThresholds`), 인기 배율도 데이터(`balance.ppajiGradePopMul`).
 * a1 은 등급 함수와 상수만 냈고, P50-a 가 켜짐(`computeRigs`·`RigState`·`walkOn`)을 낸다 — 사슬 값(`chainScale`)은 P50-b1, 입수구·경로(`computeEntries`·`path`)는 P60-d.
 */
import { Grid, FLOOR, isWaterCode } from './grid.js';
import { FacilityStore, guestWalkable, type PlacedFacility } from './facility.js';
import type { PoolStore } from './pool.js';
import balanceJson from '../data/balance.json';
import rigsJson from '../data/rigs.json';
import rigSetsJson from '../data/rig-sets.json';
import type { RigSetDef } from '../data/schema.js';
export type PpajiGrade = 0 | 1 | 2 | 3 | 4;

/** P60-c §10.3 — 기구 세트 8 (`rig-sets.json`, 불변식 3). 값 둘은 계획서 §3.2 초안(팔찌 +50G/세트 = round50 눈금 · 인기 +6/세트 = tilePopStandard 4 의 1.5칸분) — 같은 세트 둘째부터 0, 등급 판정엔 안 넣는다 */
export const RIG_SETS: readonly RigSetDef[] = rigSetsJson as RigSetDef[];
export const SET_BAND_BONUS = 50;
export const SET_POP_BONUS = 6;
const UPGRADE_FROM: ReadonlyMap<string, string> = new Map((rigsJson as { from: string; to: string }[]).map((r) => [r.to, r.from]));
/** 개조판 → 원종 (`rigs.json` from/to 사슬을 거슬러 오른다, 봇 `baseKind` 와 같은 규칙) — 세트 멤버는 원종으로 센다 */
export function rigBaseKind(defId: string): string { let id = defId; for (let k = 0; k < 4; k++) { const f = UPGRADE_FROM.get(id); if (f === undefined) break; id = f; } return id; }
const SET_MEMBER_KINDS: ReadonlySet<string> = new Set(RIG_SETS.flatMap((s) => s.members.flatMap((m) => [m, rigBaseKind(m)])));

/**
 * P60-d §3.2 — 등급 문턱은 **데이터**(`balance.ppajiGradeThresholds`, 불변식 3). 경로를 더하면 6~7차원이라 코드에 두면 밸런싱마다 코드가 바뀐다(R5 §4 ②).
 * `n[k-1]` = 등급 k 의 기구 수 · `kinds[k-1]` = 종 수(등급 3 은 경로 대안이 있다) · `pathLen/pathKinds` = 등급 3 의 경로 대안 · `lights` = 등급 4 의 조명 수
 */
export interface PpajiGradeThresholds { n: number[]; kinds: number[]; pathLen: number; pathKinds: number; lights: number }
export const PPAJI_GRADE_THRESHOLDS: PpajiGradeThresholds = (balanceJson as { ppajiGradeThresholds: PpajiGradeThresholds }).ppajiGradeThresholds;
/** 등급 3 의 경로 종 수 — 시작 `obstacle` 계열이 정확히 3종이라 「시작 해금만으로 도달 가능·도배로는 못 넘는」 최대값 (P60-d 부터 데이터 `pathKinds`) */
export const CHAIN_KINDS_FOR_GRADE3: number = PPAJI_GRADE_THRESHOLDS.pathKinds;
/** P60-d — 코스 완성 수역의 기구 이용 만족 가산 배율(`guest.ts finishUse` 의 `pop × 0.15` 항에만) */
export const PATH_COMPLETE_SAT_MUL = 1.25;
/** P60-d — 코스 완성의 최소 경로 길이. 기구 하나(휴식 하나)는 코스가 아니다 */
export const PATH_COMPLETE_MIN = 2;
/** 등급 이름 — 정보창·모달·조건 라벨이 같은 낱말을 쓴다 */
export const PPAJI_GRADE_NAMES: readonly string[] = ['수영 빠지', '놀이 빠지', '빠지', '대형 빠지', '시그니처 빠지'];

/** 등급 함수 — 규칙(어느 축이 어느 등급에 드나)은 코드, 문턱은 데이터. `chain`/`chainKinds` 에는 P60-d 부터 **경로 길이·경로 안 종 수**가 들어간다 */
export function ppajiGrade(x: { n: number; kinds: number; chain: number; chainKinds: number; lights: number }, t: PpajiGradeThresholds = PPAJI_GRADE_THRESHOLDS): PpajiGrade {
  const n = (k: number): number => t.n[k - 1] ?? Infinity, kinds = (k: number): number => t.kinds[k - 1] ?? 0;
  if (x.n >= n(4) && x.kinds >= kinds(4) && x.lights >= t.lights) return 4;
  if (x.n >= n(3) && ((x.chain >= t.pathLen && x.chainKinds >= t.pathKinds) || x.kinds >= kinds(3))) return 3;
  if (x.n >= n(2) && x.kinds >= kinds(2)) return 2;
  if (x.n >= n(1) && x.kinds >= kinds(1)) return 1;
  return 0;
}

/**
 * P50-a §3.7 — 켜짐 상태(파생 · 저장 0). `lit` = 켜진 물 위 기구 uid · `walkOn` = 그 발자국 마스크 · `byPool` = 수역 id → 켜진 물 위 기구 uid[].
 * P60-d §10.4 — 사슬 개념을 **경로**에 흡수: `chainLen(uid)` = 그 기구가 입수구에서 몇 번째인가(경로 순번, 1부터 · 경로 밖이면 1) · `chainKinds(uid)` = 그 수역 경로 안 종 수(경로 밖이면 1).
 * `chainScale(chainLen)` 정원 배율은 그대로라 「경로가 길수록 정원」이 된다.
 */
export interface RigState {
  lit: Set<number>;
  chainLen: Map<number, number>;
  chainKinds: Map<number, number>;
  /** P60-d — 수역 id → 입수구 수(뭍에 닿은 링 칸의 연속 구간 수) · 그 입수구 칸 키(k = j*w+i, 정렬) */
  entries: Map<number, number>;
  entryTiles: Map<number, number[]>;
  /** P60-d — 수역 id → 경로(켜진 물 위 기구 uid 를 입수구에서 BFS 거리 순, 동점은 uid) · 완성(끝 휴식을 뺀 앞부분 스릴 비감소 ∧ 마지막 `chain === 'rest'` ∧ 길이 ≥ PATH_COMPLETE_MIN) */
  path: Map<number, number[]>;
  pathComplete: Map<number, boolean>;
  /** P60-d — 경로 위 기구 uid → 입수구에서의 BFS 거리(기구 그래프, 씨앗 0). 경로 순서 = (거리, uid) — 봇이 「놓으면 몇 번째」를 어림하는 데 쓴다 */
  pathDist: Map<number, number>;
  walkOn: Uint8Array;
  byPool: Map<number, number[]>;
  /** P60-c — 수역 id → 성립한 세트 id(`RIG_SETS` 순, 중복 없음). 켜진 기구(+ 링 위 멤버)의 4이웃 컴포넌트 하나에 세 멤버가 다 있으면 성립 */
  sets: Map<number, string[]>;
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

export const EMPTY_RIG_STATE = (): RigState => ({ lit: new Set(), chainLen: new Map(), chainKinds: new Map(), walkOn: new Uint8Array(0), byPool: new Map(), sets: new Map(), entries: new Map(), entryTiles: new Map(), path: new Map(), pathComplete: new Map(), pathDist: new Map() });

/** P60-d — 뭍: 물도 데크도 아닌 `guestWalkable` 칸(포장·잔디·실내 — 시설이 점유하면 아니다). 입수구 판정의 유일한 술어 */
export function isShore(grid: Grid, facilities: FacilityStore, i: number, j: number): boolean {
  if (!grid.inside(i, j)) return false;
  const c = grid.at(i, j);
  return c !== FLOOR.deck && !isWaterCode(c) && guestWalkable(grid, facilities, i, j);
}

/**
 * P60-d — 수역별 **링 칸**과 **입수구 칸**. 링 = 수역 물에 4이웃으로 닿은 비수역 칸(데크 또는 뭍 둑) + 그 데크에서 4이웃 BFS 로 이어진 데크(라인 조각·잔교도 링이다).
 * 입수구 칸 = 링 칸 중 뭍이거나(둑) 뭍에 4이웃으로 닿은 데크. 입수구 수 = 입수구 칸의 8이웃 연속 구간 수(모서리를 돌아 이어지면 한 구간).
 */
export function computeEntries(grid: Grid, facilities: FacilityStore, pools: Pick<PoolStore, 'ownerIdAt'>): { entries: Map<number, number>; entryTiles: Map<number, number[]>; ringTiles: Map<number, Set<number>> } {
  const w = grid.w, h = grid.h;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const ringTiles = new Map<number, Set<number>>(); // 수역 id → 링 칸 키
  const shoreTiles = new Map<number, Set<number>>(); // 수역 id → 뭍 둑 칸(링 중 뭍)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { // 수역 칸의 4이웃만 본다 — 전 격자를 술어로 훑으면 aimPreview 예산(0.6ms)을 먹는다
    const id = pools.ownerIdAt(i, j);
    if (id < 0) continue;
    for (const [a, b] of N4) {
      const ni = i + a, nj = j + b;
      if (!grid.inside(ni, nj) || pools.ownerIdAt(ni, nj) >= 0) continue;
      const nk = nj * w + ni;
      const set = ringTiles.get(id) ?? new Set<number>();
      if (set.has(nk)) continue;
      const c = grid.at(ni, nj);
      const deck = c === FLOOR.deck, shore = !deck && isShore(grid, facilities, ni, nj);
      if (!deck && !shore) continue;
      set.add(nk); ringTiles.set(id, set);
      if (shore) { const sh = shoreTiles.get(id) ?? new Set<number>(); sh.add(nk); shoreTiles.set(id, sh); }
    }
  }
  const entries = new Map<number, number>(), entryTiles = new Map<number, number[]>();
  for (const [id, ring] of [...ringTiles].sort((x, y) => x[0] - y[0])) {
    // 링 데크에서 이어진 데크(4이웃 BFS) — 라인 조각·잔교
    const queue = [...ring].filter((k) => grid.at(k % w, Math.floor(k / w)) === FLOOR.deck);
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q] as number, i = k % w, j = Math.floor(k / w);
      for (const [a, b] of N4) {
        const ni = i + a, nj = j + b;
        if (!grid.inside(ni, nj) || grid.at(ni, nj) !== FLOOR.deck) continue;
        const nk = nj * w + ni;
        if (ring.has(nk)) continue;
        ring.add(nk); queue.push(nk);
      }
    }
    const shore = shoreTiles.get(id) ?? new Set<number>();
    const entry = new Set<number>();
    for (const k of ring) {
      if (shore.has(k)) { entry.add(k); continue; }
      const i = k % w, j = Math.floor(k / w);
      if (N4.some(([a, b]) => isShore(grid, facilities, i + a, j + b))) entry.add(k);
    }
    // 연속 구간 — 8이웃 컴포넌트 수
    const seen = new Set<number>(); let segs = 0;
    for (const s0 of [...entry].sort((x, y) => x - y)) {
      if (seen.has(s0)) continue;
      segs++; seen.add(s0); const stack = [s0];
      while (stack.length) {
        const k = stack.pop() as number, i = k % w, j = Math.floor(k / w);
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          if (a === 0 && b === 0) continue;
          const ni = i + a, nj = j + b;
          if (!grid.inside(ni, nj)) continue;
          const nk = nj * w + ni;
          if (entry.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
    }
    entries.set(id, segs);
    entryTiles.set(id, [...entry].sort((x, y) => x - y));
  }
  return { entries, entryTiles, ringTiles };
}

/**
 * R4 **켜짐 = 연결**: 링(데크)에 4이웃으로 닿은 물 위 기구가 씨앗, 켜진 기구끼리 4이웃 BFS. 안 닿으면 꺼짐(회색·이용 0).
 * 순수 · rng 0 · 저장 0 — `overlay` 는 조준 미리보기의 가짜 인스턴스(저장소 무변경).
 */
export function computeRigs(grid: Grid, facilities: FacilityStore, pools: Pick<PoolStore, 'ownerIdAt'>, overlay?: RigOverlay): RigState {
  const w = grid.w;
  const rigs: { uid: number; defId: string; chain: string | null; fp: { i: number; j: number }[] }[] = [];
  const ringNodes: { uid: number; defId: string; fp: { i: number; j: number }[] }[] = []; // P60-c: 링 위 세트 멤버(플로팅 바·슬라이드 도크) — 켜짐·사슬엔 안 들고 세트 그래프의 노드로만
  const consider = (f: Pick<PlacedFacility, 'uid' | 'defId' | 'i' | 'j' | 'facing'>): void => {
    const def = facilities.defById(f.defId);
    if (!def) return;
    if (def.onRing === true) { if (SET_MEMBER_KINDS.has(rigBaseKind(f.defId))) ringNodes.push({ uid: f.uid, defId: f.defId, fp: FacilityStore.footprint(def, f.i, f.j, f.facing) }); return; }
    if (def.class !== 'rig') return;
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
  // P60-d §10.4 — 경로: 수역마다 켜진 기구를 입수구 칸에서 BFS(기구 그래프) 거리 순으로. 소속 수역을 먼저 정한다(발자국 칸 수 최다, 동점은 id 작은 쪽)
  const poolOfRig = new Map<number, number>(); // idx → 수역
  for (const idx of litIdx) {
    const r = rigs[idx] as { fp: { i: number; j: number }[] };
    const cnt = new Map<number, number>();
    for (const t of r.fp) { const id = pools.ownerIdAt(t.i, t.j); if (id >= 0) cnt.set(id, (cnt.get(id) ?? 0) + 1); }
    let best = -1, bestN = 0;
    for (const [id, n] of cnt) if (n > bestN || (n === bestN && id < best)) { best = id; bestN = n; }
    if (best >= 0) poolOfRig.set(idx, best);
  }
  const ent = computeEntries(grid, facilities, pools);
  st.entries = ent.entries; st.entryTiles = ent.entryTiles;
  const uidKey = (u: number): number => (u < 0 ? Number.MAX_SAFE_INTEGER : u); // 오버레이(음수 uid)는 놓이면 가장 큰 uid 가 된다 — 동점 순서가 미리보기와 실값에서 같게
  const pathIndex = new Map<number, number>(), pathKinds = new Map<number, number>(); // idx → 순번(1부터) · 수역 → 종 수
  for (const pid of [...new Set(poolOfRig.values())].sort((a, b) => a - b)) {
    const entry = new Set(ent.entryTiles.get(pid) ?? []);
    const members = [...poolOfRig].filter(([, p]) => p === pid).map(([idx]) => idx);
    const dist = new Map<number, number>();
    const queue: number[] = [];
    for (const idx of members) {
      const r = rigs[idx] as { fp: { i: number; j: number }[] };
      if (entry.size > 0 && r.fp.some((t) => N4.some(([a, b]) => entry.has((t.j + b) * w + t.i + a)))) { dist.set(idx, 0); queue.push(idx); }
    }
    for (let q = 0; q < queue.length; q++) {
      const idx = queue[q] as number, d = dist.get(idx) as number;
      for (const t of (rigs[idx] as { fp: { i: number; j: number }[] }).fp) for (const [a, b] of N4) {
        const o = tileOf.get((t.j + b) * w + t.i + a);
        if (o === undefined || dist.has(o) || poolOfRig.get(o) !== pid) continue;
        dist.set(o, d + 1); queue.push(o);
      }
    }
    const order = [...dist].sort((x, y) => x[1] - y[1] || uidKey((rigs[x[0]] as { uid: number }).uid) - uidKey((rigs[y[0]] as { uid: number }).uid)).map(([idx]) => idx);
    order.forEach((idx, k) => { pathIndex.set(idx, k + 1); st.pathDist.set((rigs[idx] as { uid: number }).uid, dist.get(idx) as number); });
    pathKinds.set(pid, new Set(order.map((idx) => (rigs[idx] as { defId: string }).defId)).size);
    st.path.set(pid, order.map((idx) => (rigs[idx] as { uid: number }).uid));
    // 완성 — 마지막이 rest ∧ 길이 ≥ PATH_COMPLETE_MIN ∧ 끝의 휴식(연속)을 뺀 앞부분의 스릴이 비감소. 휴식은 데이터가 스릴 0 이라 「오르다가 끝에 쉰다」로 읽는다 — 휴식이 중간에 끼면 그 0 이 감소라 미완성
    let complete = order.length >= PATH_COMPLETE_MIN && (rigs[order[order.length - 1] as number] as { chain: string | null }).chain === 'rest';
    if (complete) {
      let end = order.length; while (end > 0 && (rigs[order[end - 1] as number] as { chain: string | null }).chain === 'rest') end--;
      let prev = -Infinity;
      for (const idx of order.slice(0, end)) { const th = facilities.defById((rigs[idx] as { defId: string }).defId)?.thrill ?? 0; if (th < prev) { complete = false; break; } prev = th; }
    }
    st.pathComplete.set(pid, complete);
  }
  const poolOfNode = new Map<number, number>(); // P60-c: 노드 → 소속 수역
  for (const idx of litIdx) {
    const r = rigs[idx] as { uid: number; fp: { i: number; j: number }[] };
    st.lit.add(r.uid);
    const best = poolOfRig.get(idx) ?? -1;
    st.chainLen.set(r.uid, pathIndex.get(idx) ?? 1); // 경로 순번 — 경로 밖(입수구 0 인 수역 · 입수구에서 안 닿는 기구)은 1
    st.chainKinds.set(r.uid, pathIndex.has(idx) ? (pathKinds.get(best) ?? 1) : 1);
    for (const t of r.fp) st.walkOn[t.j * w + t.i] = 1;
    if (best >= 0) { const arr = st.byPool.get(best) ?? []; arr.push(r.uid); st.byPool.set(best, arr); poolOfNode.set(idx, best); }
  }
  // P60-c §10.3 세트 — 노드 = 켜진 물 위 기구 + 링 위 세트 멤버(수역은 4이웃 물의 소유 최다), 변 = 같은 수역 안 4이웃 접촉. 컴포넌트 하나에 세 멤버(원종)가 다 있으면 성립. 수역마다 같은 세트는 한 번(둘째부터 0)
  const nodeTile = new Map<number, number>(); // k → 노드 번호 (물 위 기구 idx · 링 노드는 rigs.length + r)
  for (const idx of litIdx) for (const t of (rigs[idx] as { fp: { i: number; j: number }[] }).fp) nodeTile.set(t.j * w + t.i, idx);
  ringNodes.forEach((r, k) => {
    const cnt = new Map<number, number>();
    for (const t of r.fp) for (const [a, b] of N4) { const id = pools.ownerIdAt(t.i + a, t.j + b); if (id >= 0) cnt.set(id, (cnt.get(id) ?? 0) + 1); }
    let best = -1, bestN = 0;
    for (const [id, n] of cnt) if (n > bestN || (n === bestN && id < best)) { best = id; bestN = n; }
    if (best < 0) return;
    const node = rigs.length + k;
    poolOfNode.set(node, best);
    for (const t of r.fp) nodeTile.set(t.j * w + t.i, node);
  });
  const fpOf = (node: number): { i: number; j: number }[] => (node < rigs.length ? (rigs[node] as { fp: { i: number; j: number }[] }).fp : (ringNodes[node - rigs.length] as { fp: { i: number; j: number }[] }).fp);
  const defIdOf = (node: number): string => (node < rigs.length ? (rigs[node] as { defId: string }).defId : (ringNodes[node - rigs.length] as { defId: string }).defId);
  const seenNode = new Set<number>();
  for (const s0 of [...poolOfNode.keys()].sort((a, b) => a - b)) {
    if (seenNode.has(s0)) continue;
    const pool = poolOfNode.get(s0) as number;
    const members: number[] = [s0]; seenNode.add(s0);
    for (let q = 0; q < members.length; q++) for (const t of fpOf(members[q] as number)) for (const [a, b] of N4) {
      const o = nodeTile.get((t.j + b) * w + t.i + a);
      if (o === undefined || seenNode.has(o) || poolOfNode.get(o) !== pool) continue;
      seenNode.add(o); members.push(o);
    }
    const kinds = new Set<string>(); for (const m of members) { const id = defIdOf(m); kinds.add(id); kinds.add(rigBaseKind(id)); } // 개조판은 원종으로도 센다(밤빠지의 LED 선베드처럼 멤버가 개조판이면 그 id 그대로)
    const have = st.sets.get(pool) ?? [];
    for (const def of RIG_SETS) if (!have.includes(def.id) && def.members.every((m) => kinds.has(m))) have.push(def.id);
    if (have.length) st.sets.set(pool, have.sort((x, y) => RIG_SETS.findIndex((d) => d.id === x) - RIG_SETS.findIndex((d) => d.id === y)));
  }
  return st;
}
