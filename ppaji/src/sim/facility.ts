/**
 * 시설 — 배치·철거·발자국 점유. 손님 길을 막고(`occupied`), 풀에 인접하면 향·SE/AB 를 준다.
 * 규칙은 전부 여기 하나: 토지 안 · 잔디/포장 위 · 풀·입구·다른 시설과 안 겹침 · 입구 도달 유지는 Game 이 전후 비교.
 */
import type { FacilityDef } from '../data/schema.js';
import { Grid, FLOOR, type Rect, inLandOrWater, isGround, isWalkFloor } from './grid.js';
import { chainScale } from './rig.js';

export interface PlacedFacility {
  uid: number;
  defId: string;
  i: number;
  j: number;
  facing: 0 | 1;
  /** 유료 라운지 — 오늘 대여한 손님 uid */
  rentedBy: number | null;
  /** 오늘 이용 횟수 (정보 창) */
  usesToday: number;
  /** 개선 단계 1..MAX_LEVEL (G19) — 인기 +15%/단, 정원 +1 (3단·5단) */
  level: number;
  usesTotal: number;
  incomeToday: number;
  incomeTotal: number;
  /** 알바 슬롯 (P8, D14) — 1 이면 이 시설에 알바 한 명. 임금은 유지비에 합산 */
  staff?: 0 | 1;
  /** P49-a1 — 사슬 길이(파생, 저장 안 함 — P50-b1) · 오늘 낸 팔찌(P52-a) · 어제 수입(P51). 전부 optional, a1 은 안 쓴다 */
  chainLen?: number;
  paidToday?: number;
  incomeYest?: number;
}

/** 알바 하루 임금 (P8) — 화장실 유지비 60G 와 같은 눈금 */
export const PART_TIMER_WAGE = 60;
/** 알바를 둘 수 있는 분류 — 매점(회전·만족) · 놀이/선착장(안전 = HP 덜 닳음) · 편의(청결) */
export const STAFFABLE_CLASSES: readonly string[] = ['restaurant', 'attraction', 'utility'];
export function staffable(def: { class: string; capacity: number }): boolean {
  return STAFFABLE_CLASSES.includes(def.class) && def.capacity > 0;
}

export const FACILITY_MAX_LEVEL = 5;

export interface FacilitySnapshot {
  nextUid: number;
  list: PlacedFacility[];
}

export type FacilityFail = 'unknown' | 'outside-land' | 'bad-floor' | 'on-pool' | 'on-gate' | 'level-mixed' | 'overlap' | 'not-on-ppaji' | 'not-on-ring' | 'depth-mismatch'; // P49-a1 §3.6 셋

export const FACILITY_FAIL_KO: Record<FacilityFail, string> = {
  unknown: '알 수 없는 시설',
  'outside-land': '아직 내 땅이 아닙니다 — 랭크를 올리면 넓어집니다',
  'bad-floor': '잔디나 포장 위에만 놓을 수 있습니다',
  'on-pool': '풀 위에는 놓을 수 없습니다',
  'on-gate': '입구는 막을 수 없습니다',
  'level-mixed': '경사입니다 — 단이 고른 평지에 놓으세요',
  overlap: '다른 시설과 겹칩니다',
  'not-on-ppaji': '빠지 안 물 위에만 — 데크로 두른 물에 놓으세요',
  'not-on-ring': '빠지 링(데크) 위에만 놓을 수 있습니다',
  'depth-mismatch': '깊이가 안 맞습니다 — 여울용은 여울에, 깊은 물용은 강에',
};

/** 개선 단계가 반영된 인기 — 정본 하나 (파크 인기·정보 창·랭킹이 같이 쓴다) */
export function popOf(def: FacilityDef, f: { level: number }): number {
  return Math.round(def.pop * (1 + 0.15 * (f.level - 1)));
}
/** 개선 단계가 반영된 정원 — 3단·5단에서 +1 · P50-b1 R5: 계열 사슬은 **여기에만** `× chainScale(chainLen)` (스릴·인기엔 안 곱한다) */
export function capacityOf(def: FacilityDef, f: { level: number; chainLen?: number }): number {
  return def.capacity <= 0 ? 0 : Math.round((def.capacity + (f.level >= 3 ? 1 : 0) + (f.level >= 5 ? 1 : 0)) * chainScale(f.chainLen ?? 1));
}
/** 개선 비용 — 건설비 × 0.5 × 현재 단계 */
export function upgradeCost(def: FacilityDef, f: { level: number }): number {
  return Math.round(def.cost * 0.5 * f.level / 10) * 10;
}

/** P50-a §3.6 — 물 위 배치 규칙. `check()` 의 필수 인자(빠뜨리면 옛 「데크 위에만」 관용이 조용히 돌아온다) */
export interface WaterRules {
  /** FLOOR.pool ∧ 내 허가 안 */
  ppajiWater(i: number, j: number): boolean;
  /** 자연 바닥 파생 — 여울이면 shallow */
  depthAt(i: number, j: number): 'shallow' | 'deep';
  /** 링 = 데크 ∨ 물에 4이웃으로 닿은 뭍 */
  ring(i: number, j: number): boolean;
}
/** P50-a §3.6 — 「손님이 설 수 있는 칸」 술어 **하나**. 켜진 물 위 기구 발자국(`walkOn`)이거나, 걷는 바닥이고 시설이 안 점유한 곳. 세 호출부(guest·game×2)가 같은 문자열로 부른다(정적 검사) */
export function guestWalkable(grid: Grid, fs: FacilityStore, i: number, j: number): boolean {
  return fs.isWalkOn(i, j) || (isWalkFloor(grid.at(i, j)) && !fs.occupied(i, j));
}

export class FacilityStore {
  private list: PlacedFacility[] = [];
  /** P50-a — 켜진 물 위 기구 발자국 마스크(k → 1). `computeRigs` 가 내고 `setWalkOn` 이 받는다 — 저장 0 */
  private walkOn: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private nextUid = 1;
  /** 타일 → 시설 uid (0 = 빈 칸) */
  private readonly occ: Uint16Array;
  version = 0;

  constructor(
    private readonly grid: Grid,
    private readonly defs: ReadonlyMap<string, FacilityDef>,
  ) {
    this.occ = new Uint16Array(grid.w * grid.h);
  }

  /** 정의 수 (수집 분모, G53) */
  get defsCount(): number {
    return this.defs.size;
  }

  get all(): readonly PlacedFacility[] {
    return this.list;
  }

  def(id: string): FacilityDef | undefined {
    return this.defs.get(id);
  }

  defOf(f: PlacedFacility): FacilityDef {
    const d = this.defs.get(f.defId);
    if (!d) throw new Error(`시설 정의 없음: ${f.defId}`);
    return d;
  }

  /** 상태가 바뀌었음을 알린다 (개선 등) — 캐시 키가 version 을 본다 */
  bump(): void {
    this.version++;
  }

  byUid(uid: number): PlacedFacility | undefined {
    return this.list.find((f) => f.uid === uid);
  }

  /** 이 칸을 점유한 시설 */
  at(i: number, j: number): PlacedFacility | undefined {
    if (!this.grid.inside(i, j)) return undefined;
    const uid = this.occ[j * this.grid.w + i] as number;
    return uid === 0 ? undefined : this.byUid(uid);
  }

  occupied(i: number, j: number): boolean {
    return this.grid.inside(i, j) && (this.occ[j * this.grid.w + i] as number) !== 0;
  }
  isWalkOn(i: number, j: number): boolean {
    return this.grid.inside(i, j) && this.walkOn.length === this.grid.w * this.grid.h && this.walkOn[j * this.grid.w + i] === 1;
  }
  /** 새 마스크를 받고 「켜져 있다가 꺼진 칸」을 돌려준다 — 호출부가 그 위 손님을 `evictFrom` 한다 */
  setWalkOn(mask: Uint8Array<ArrayBufferLike>): { i: number; j: number }[] {
    const dark: { i: number; j: number }[] = [];
    const w = this.grid.w;
    if (this.walkOn.length === mask.length) for (let k = 0; k < mask.length; k++) if (this.walkOn[k] === 1 && mask[k] !== 1) dark.push({ i: k % w, j: Math.floor(k / w) });
    this.walkOn = mask;
    return dark;
  }
  defById(id: string): FacilityDef | undefined { return this.defs.get(id); }
  /** P50-b2 검사 전용 읽기 표면 — 조준 미리보기가 저장소를 안 만졌는지(nextUid · 점유표 해시) */
  probeState(): { nextUid: number; occHash: number } { let h = 2166136261; for (let k = 0; k < this.occ.length; k++) { h ^= (this.occ[k] as number) & 0xffff; h = Math.imul(h, 16777619) >>> 0; } return { nextUid: this.nextUid, occHash: h >>> 0 }; }

  /**
   * 발자국 — 탑 w×d 에 슬라이드면 **활강로**(`length` 칸 한 줄)가 붙는다: facing 0 은 +I 쪽, 1 은 +J 쪽.
   * 활강로 끝 다음 칸이 풀이면 그 풀에 착수(AB) — 인접 판정은 발자국 고리가 하므로 저절로 된다.
   */
  static footprint(def: FacilityDef, i: number, j: number, facing: 0 | 1): { i: number; j: number }[] {
    const w = facing === 1 ? def.d : def.w;
    const d = facing === 1 ? def.w : def.d;
    const out: { i: number; j: number }[] = [];
    for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) out.push({ i: i + a, j: j + b });
    if (def.slide) {
      for (let k = 0; k < def.slide.length; k++) {
        if (facing === 0) out.push({ i: i + w + k, j: j + Math.floor(d / 2) });
        else out.push({ i: i + Math.floor(w / 2), j: j + d + k });
      }
    }
    return out;
  }

  /** 활강로 칸들 (탑 다음부터 출구까지, 순서대로). 슬라이드가 아니면 빈 배열 (G26) */
  static lane(def: FacilityDef, i: number, j: number, facing: 0 | 1): { i: number; j: number }[] {
    if (!def.slide) return [];
    const w = facing === 1 ? def.d : def.w;
    const d = facing === 1 ? def.w : def.d;
    return FacilityStore.footprint(def, i, j, facing).slice(w * d);
  }

  /** 활강로가 시작되는 탑 칸 (렌더의 drawLanes 와 같은 칸) — 손님이 여기 올라선다 (G26) */
  static slideTop(def: FacilityDef, i: number, j: number, facing: 0 | 1): { i: number; j: number } {
    const w = facing === 1 ? def.d : def.w;
    const d = facing === 1 ? def.w : def.d;
    return facing === 0 ? { i: i + w - 1, j: j + Math.floor(d / 2) } : { i: i + Math.floor(w / 2), j: j + d - 1 };
  }

  /** 슬라이드 출구 칸 (활강로 끝). 슬라이드가 아니면 null */
  static exitTile(def: FacilityDef, i: number, j: number, facing: 0 | 1): { i: number; j: number } | null {
    if (!def.slide) return null;
    const fp = FacilityStore.footprint(def, i, j, facing);
    return fp[fp.length - 1] ?? null;
  }

  /** 발자국 바깥 4이웃 (인접 판정에 쓴다) */
  static ring(def: FacilityDef, i: number, j: number, facing: 0 | 1): { i: number; j: number }[] {
    const fp = FacilityStore.footprint(def, i, j, facing);
    const set = new Set(fp.map((t) => `${t.i},${t.j}`));
    const out: { i: number; j: number }[] = [];
    const seen = new Set<string>();
    for (const t of fp) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = `${t.i + di},${t.j + dj}`;
        if (set.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push({ i: t.i + di, j: t.j + dj });
      }
    }
    return out;
  }

  /** `ignoreUid` — 이동(G52): 자기 발자국은 겹침으로 치지 않는다 */
  check(defId: string, i: number, j: number, facing: 0 | 1, land: Rect, gate: { i: number; j: number }, ignoreUid: number, permitDepth: number, water: WaterRules): { ok: true } | { ok: false; fail: FacilityFail } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, fail: 'unknown' };
    const waterRig = def.class === 'rig' && def.onRing !== true; // P50-a §3.6: 물 위 기구
    const fp = FacilityStore.footprint(def, i, j, facing);
    for (const t of fp) {
      if (!this.grid.inside(t.i, t.j) || !inLandOrWater(this.grid, land, t.i, t.j, permitDepth)) return { ok: false, fail: 'outside-land' }; // P14: 내 앞 수면의 데크 위도 내 땅
      if (t.i === gate.i && t.j === gate.j) return { ok: false, fail: 'on-gate' };
      const f = this.grid.at(t.i, t.j);
      if (waterRig) {
        // 발자국 전 칸이 빠지 안 물(허가 안) · 깊이가 `any` 거나 전 칸 일치
        if (!water.ppajiWater(t.i, t.j)) return { ok: false, fail: 'not-on-ppaji' };
        if (def.depth !== undefined && def.depth !== 'any' && water.depthAt(t.i, t.j) !== def.depth) return { ok: false, fail: 'depth-mismatch' };
      } else if (def.onRing === true) {
        // 링 시설 — 전 칸 링(데크 ∨ 물가 뭍), 슬라이드 활강로 칸은 빠지 물도 된다
        if (!water.ring(t.i, t.j) && !(def.slide && water.ppajiWater(t.i, t.j))) return { ok: false, fail: 'not-on-ring' };
      } else {
        if (f === FLOOR.pool || f === FLOOR.river || f === FLOOR.shallow) return { ok: false, fail: 'on-pool' };
        if (f !== FLOOR.grass && f !== FLOOR.path && f !== FLOOR.indoor && f !== FLOOR.deck && !isGround(f)) return { ok: false, fail: 'bad-floor' }; // P22 지면 위에도 놓는다
      }
      const o = this.occ[t.j * this.grid.w + t.i] ?? 0;
      if (o !== 0 && o !== ignoreUid) return { ok: false, fail: 'overlap' };
    }
    if (def.onRing === true && def.depth !== undefined && def.depth !== 'any') {
      // 링 시설의 깊이 — 4이웃 물 중 하나 이상이 그 깊이
      const isW = (c: number): boolean => c === FLOOR.pool || c === FLOOR.river || c === FLOOR.shallow;
      const ok = fp.some((t) => ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => this.grid.inside(t.i + a, t.j + b) && isW(this.grid.at(t.i + a, t.j + b)) && water.depthAt(t.i + a, t.j + b) === def.depth));
      if (!ok) return { ok: false, fail: 'depth-mismatch' };
    }
    // P0-B: 시설은 단이 균일한 발자국에만 (토지 → 입구 → 바닥 → 겹침 → 경사 순)
    const fw = facing === 1 ? def.d : def.w; const fd = facing === 1 ? def.w : def.d;
    if (!this.grid.levelUniform(i, j, fw, fd)) return { ok: false, fail: 'level-mixed' };
    return { ok: true };
  }

  /** 검사용 — `check()` 의 실패 사유를 그대로 돌려준다(하네스·단위 검사가 사유 문자열이 아니라 키로 잰다) */
  probeForTest(defId: string, i: number, j: number, facing: 0 | 1, land: Rect, gate: { i: number; j: number }, permitDepth: number, water: WaterRules): FacilityFail | 'ok' {
    const r = this.check(defId, i, j, facing, land, gate, 0, permitDepth, water);
    return r.ok ? 'ok' : r.fail;
  }

  place(defId: string, i: number, j: number, facing: 0 | 1): PlacedFacility {
    const def = this.defs.get(defId);
    if (!def) throw new Error(`시설 정의 없음: ${defId}`);
    const f: PlacedFacility = { uid: this.nextUid++, defId, i, j, facing, rentedBy: null, usesToday: 0, level: 1, usesTotal: 0, incomeToday: 0, incomeTotal: 0 };
    if (def.id !== 'entrance') for (const t of FacilityStore.footprint(def, i, j, facing)) this.occ[t.j * this.grid.w + t.i] = f.uid; // P42: 입구는 밟고 지나가는 자리 — 점유하지 않는다
    this.list.push(f);
    this.version++;
    return f;
  }

  /** 자리만 바꾼다 (G52, 원작 이동 도구) — uid·단계·메뉴·통계는 그대로 */
  move(uid: number, i: number, j: number, facing: 0 | 1): PlacedFacility | null {
    const f = this.list.find((x) => x.uid === uid);
    if (!f) return null;
    const def = this.defOf(f);
    if (def.id !== 'entrance') for (const t of FacilityStore.footprint(def, f.i, f.j, f.facing)) this.occ[t.j * this.grid.w + t.i] = 0;
    f.i = i; f.j = j; f.facing = facing;
    if (def.id !== 'entrance') for (const t of FacilityStore.footprint(def, i, j, facing)) this.occ[t.j * this.grid.w + t.i] = f.uid; // P42: 입구는 밟고 지나가는 자리 — 점유하지 않는다
    this.version++;
    return f;
  }

  remove(uid: number): PlacedFacility | null {
    const at = this.list.findIndex((f) => f.uid === uid);
    if (at < 0) return null;
    const f = this.list[at] as PlacedFacility;
    for (const t of FacilityStore.footprint(this.defOf(f), f.i, f.j, f.facing)) this.occ[t.j * this.grid.w + t.i] = 0;
    this.list.splice(at, 1);
    this.version++;
    return f;
  }

  /** 풀 타일 집합에 인접한 시설들 */
  adjacentTo(tiles: ReadonlySet<number>): PlacedFacility[] {
    const out: PlacedFacility[] = [];
    for (const f of this.list) {
      const def = this.defOf(f);
      const near = FacilityStore.ring(def, f.i, f.j, f.facing).some((t) => tiles.has(t.j * this.grid.w + t.i));
      if (near) out.push(f);
    }
    return out;
  }

  /** 시설 발자국의 앞면(+I·+J 바깥) 칸 중 걸을 수 있는 곳 — 손님이 서는 자리 */
  entryTiles(f: PlacedFacility, walkable: (i: number, j: number) => boolean): { i: number; j: number }[] {
    return FacilityStore.ring(this.defOf(f), f.i, f.j, f.facing).filter((t) => walkable(t.i, t.j));
  }

  resetDay(): void {
    for (const f of this.list) {
      f.rentedBy = null;
      f.incomeYest = f.incomeToday; // P51: 정보창 「어제 수입」
      f.usesToday = 0;
      f.incomeToday = 0;
      delete f.paidToday; // P51: 그날 환불은 그날까지
    }
  }
  /** P51 G1 — 개조: `move` 와 대칭. uid·자리·방향·알바·수입 보존, `defId` 만 바뀐다(발자국 크기는 같아야 한다 — 다르면 null) */
  convert(uid: number, toDefId: string): PlacedFacility | null {
    const f = this.list.find((x) => x.uid === uid);
    const to = this.defs.get(toDefId);
    if (!f || !to) return null;
    const from = this.defOf(f);
    if (from.w !== to.w || from.d !== to.d) return null;
    f.defId = toDefId;
    this.version++;
    return f;
  }

  /** 파크 인기 — 계절 벡터(`def.season[4]`, §1.4)가 더해진다 (G36: 그동안 읽는 곳이 없던 데이터) */
  totalPopularity(season = -1): number {
    return this.list.reduce((n, f) => { const d = this.defOf(f); return n + popOf(d, f) + (season >= 0 ? (d.season[season] ?? 0) : 0); }, 0);
  }

  totalMaintenance(): number {
    return this.list.reduce((n, f) => n + this.defOf(f).maint, 0);
  }

  toSnapshot(): FacilitySnapshot {
    return { nextUid: this.nextUid, list: this.list.map((f) => { const o = { ...f }; delete o.chainLen; return o; }) }; // P50-b1: chainLen 은 파생(로드 뒤 `refreshRigs` 가 채운다) — 목록 밖
  }

  fromSnapshot(s: FacilitySnapshot): void {
    this.nextUid = s.nextUid;
    this.list = [];
    this.occ.fill(0);
    for (const f of s.list) {
      const def = this.defs.get(f.defId);
      if (!def) continue; // 데이터에서 사라진 시설은 조용히 버린다 — 세이브가 데이터를 이기면 안 된다
      for (const t of FacilityStore.footprint(def, f.i, f.j, f.facing)) this.occ[t.j * this.grid.w + t.i] = f.uid;
      this.list.push({ ...f });
    }
    this.version++;
  }
}
