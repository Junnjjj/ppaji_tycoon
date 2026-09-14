/**
 * 시설 — 배치·철거·발자국 점유. 손님 길을 막고(`occupied`), 풀에 인접하면 향·SE/AB 를 준다.
 * 규칙은 전부 여기 하나: 토지 안 · 잔디/포장 위 · 풀·입구·다른 시설과 안 겹침 · 입구 도달 유지는 Game 이 전후 비교.
 */
import type { FacilityDef } from '../data/schema.js';
import { Grid, FLOOR, inRect, type Rect } from './grid.js';

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
}

export const FACILITY_MAX_LEVEL = 5;

export interface FacilitySnapshot {
  nextUid: number;
  list: PlacedFacility[];
}

export type FacilityFail = 'unknown' | 'outside-land' | 'bad-floor' | 'on-pool' | 'on-gate' | 'overlap';

export const FACILITY_FAIL_KO: Record<FacilityFail, string> = {
  unknown: '알 수 없는 시설',
  'outside-land': '아직 내 땅이 아닙니다 — 랭크를 올리면 넓어집니다',
  'bad-floor': '잔디나 포장 위에만 놓을 수 있습니다',
  'on-pool': '풀 위에는 놓을 수 없습니다',
  'on-gate': '입구는 막을 수 없습니다',
  overlap: '다른 시설과 겹칩니다',
};

/** 개선 단계가 반영된 인기 — 정본 하나 (파크 인기·정보 창·랭킹이 같이 쓴다) */
export function popOf(def: FacilityDef, f: { level: number }): number {
  return Math.round(def.pop * (1 + 0.15 * (f.level - 1)));
}
/** 개선 단계가 반영된 정원 — 3단·5단에서 +1 */
export function capacityOf(def: FacilityDef, f: { level: number }): number {
  return def.capacity <= 0 ? 0 : def.capacity + (f.level >= 3 ? 1 : 0) + (f.level >= 5 ? 1 : 0);
}
/** 개선 비용 — 건설비 × 0.5 × 현재 단계 */
export function upgradeCost(def: FacilityDef, f: { level: number }): number {
  return Math.round(def.cost * 0.5 * f.level / 10) * 10;
}

export class FacilityStore {
  private list: PlacedFacility[] = [];
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
  check(defId: string, i: number, j: number, facing: 0 | 1, land: Rect, gate: { i: number; j: number }, ignoreUid = 0): { ok: true } | { ok: false; fail: FacilityFail } {
    const def = this.defs.get(defId);
    if (!def) return { ok: false, fail: 'unknown' };
    for (const t of FacilityStore.footprint(def, i, j, facing)) {
      if (!this.grid.inside(t.i, t.j) || !inRect(land, t.i, t.j)) return { ok: false, fail: 'outside-land' };
      if (t.i === gate.i && t.j === gate.j) return { ok: false, fail: 'on-gate' };
      const f = this.grid.at(t.i, t.j);
      if (f === FLOOR.pool) return { ok: false, fail: 'on-pool' };
      if (f !== FLOOR.grass && f !== FLOOR.path && f !== FLOOR.indoor) return { ok: false, fail: 'bad-floor' };
      const o = this.occ[t.j * this.grid.w + t.i] ?? 0;
      if (o !== 0 && o !== ignoreUid) return { ok: false, fail: 'overlap' };
    }
    return { ok: true };
  }

  place(defId: string, i: number, j: number, facing: 0 | 1): PlacedFacility {
    const def = this.defs.get(defId);
    if (!def) throw new Error(`시설 정의 없음: ${defId}`);
    const f: PlacedFacility = { uid: this.nextUid++, defId, i, j, facing, rentedBy: null, usesToday: 0, level: 1, usesTotal: 0, incomeToday: 0, incomeTotal: 0 };
    for (const t of FacilityStore.footprint(def, i, j, facing)) this.occ[t.j * this.grid.w + t.i] = f.uid;
    this.list.push(f);
    this.version++;
    return f;
  }

  /** 자리만 바꾼다 (G52, 원작 이동 도구) — uid·단계·메뉴·통계는 그대로 */
  move(uid: number, i: number, j: number, facing: 0 | 1): PlacedFacility | null {
    const f = this.list.find((x) => x.uid === uid);
    if (!f) return null;
    const def = this.defOf(f);
    for (const t of FacilityStore.footprint(def, f.i, f.j, f.facing)) this.occ[t.j * this.grid.w + t.i] = 0;
    f.i = i; f.j = j; f.facing = facing;
    for (const t of FacilityStore.footprint(def, i, j, facing)) this.occ[t.j * this.grid.w + t.i] = f.uid;
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
      f.usesToday = 0;
      f.incomeToday = 0;
    }
  }

  /** 파크 인기 — 계절 벡터(`def.season[4]`, §1.4)가 더해진다 (G36: 그동안 읽는 곳이 없던 데이터) */
  totalPopularity(season = -1): number {
    return this.list.reduce((n, f) => { const d = this.defOf(f); return n + popOf(d, f) + (season >= 0 ? (d.season[season] ?? 0) : 0); }, 0);
  }

  totalMaintenance(): number {
    return this.list.reduce((n, f) => n + this.defOf(f).maint, 0);
  }

  toSnapshot(): FacilitySnapshot {
    return { nextUid: this.nextUid, list: this.list.map((f) => ({ ...f })) };
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
