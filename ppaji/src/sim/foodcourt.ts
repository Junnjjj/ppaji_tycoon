/**
 * P58-a — 푸드코트(식탁 자리) 영역 (2026-09-15, `docs/plan-ppaji-foodcourt.md` D1~D8).
 * 수역과 같은 「물건」이다: 실내 바닥 위 사각형 하나가 저장의 전부이고, 3×2 블록마다 **파생 시설** `foodcourt_seat`(식탁 1 + 의자 2 = 정원 2, 무료)이
 * 자동으로 놓인다 — 건물처럼 하나씩 짓지 않는다(사용자: 「영역을 만들면 식탁이 나타나게」). 바닥은 씬이 아주 연하게 틴트한다.
 * ⚠ D47(구역 종류 없음)과 다르다 — 어떤 배치도 막지 않는 물건이며 이름표·조건이 없다.
 */
export const COURT_BLOCK_W = 3;
export const COURT_BLOCK_H = 2;
/** 칸당 비용 — 실내 바닥 붓(40G)의 1.5배 */
export const FOODCOURT_TILE_COST = 60;
export const FOODCOURT_SEAT_DEF = 'foodcourt_seat';

export interface FoodCourtRect { i0: number; j0: number; w: number; h: number }
export interface FoodCourt extends FoodCourtRect { id: number; name?: string }
export interface FoodCourtSnapshot { nextId: number; courts: FoodCourt[] }

export function courtContains(c: FoodCourtRect, i: number, j: number): boolean { return i >= c.i0 && i < c.i0 + c.w && j >= c.j0 && j < c.j0 + c.h; }
/** 사각형 안에 온전히 드는 3×2 블록의 왼쪽 위 칸들 — 남는 칸은 통로(자리 없음) */
export function courtBlocks(c: FoodCourtRect): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = [];
  for (let j = c.j0; j + COURT_BLOCK_H <= c.j0 + c.h; j += COURT_BLOCK_H) for (let i = c.i0; i + COURT_BLOCK_W <= c.i0 + c.w; i += COURT_BLOCK_W) out.push({ i, j });
  return out;
}
export function courtSeats(c: FoodCourtRect): number { return courtBlocks(c).length * 2; }

export class FoodCourtStore {
  private list: FoodCourt[] = [];
  private nextId = 1;
  /** 편집 세대 — 틴트·캐시가 이걸로 무효화된다 */
  version = 0;
  get all(): readonly FoodCourt[] { return this.list; }
  byId(id: number): FoodCourt | undefined { return this.list.find((c) => c.id === id); }
  ownerAt(i: number, j: number): number | null { for (const c of this.list) if (courtContains(c, i, j)) return c.id; return null; }
  /** 새 사각형이 통째로 덮는(= 확장으로 대체될) 기존 영역들 */
  coveredBy(r: FoodCourtRect): FoodCourt[] { return this.list.filter((c) => c.i0 >= r.i0 && c.j0 >= r.j0 && c.i0 + c.w <= r.i0 + r.w && c.j0 + c.h <= r.j0 + r.h); }
  /** 겹치지만 통째로 덮이지는 않는 기존 영역 — 거절 사유 */
  crossedBy(r: FoodCourtRect): FoodCourt | undefined { return this.list.find((c) => !(c.i0 >= r.i0 && c.j0 >= r.j0 && c.i0 + c.w <= r.i0 + r.w && c.j0 + c.h <= r.j0 + r.h) && c.i0 < r.i0 + r.w && r.i0 < c.i0 + c.w && c.j0 < r.j0 + r.h && r.j0 < c.j0 + c.h); }
  add(r: FoodCourtRect, name?: string): FoodCourt { const c: FoodCourt = { id: this.nextId++, i0: r.i0, j0: r.j0, w: r.w, h: r.h, ...(name ? { name } : {}) }; this.list.push(c); this.version++; return c; }
  remove(id: number): FoodCourt | null { const k = this.list.findIndex((c) => c.id === id); if (k < 0) return null; const [c] = this.list.splice(k, 1); this.version++; return c ?? null; }
  totalSeats(): number { return this.list.reduce((n, c) => n + courtSeats(c), 0); }
  totalTiles(): number { return this.list.reduce((n, c) => n + c.w * c.h, 0); }
  tileKeys(w: number): Set<number> { const s = new Set<number>(); for (const c of this.list) for (let j = c.j0; j < c.j0 + c.h; j++) for (let i = c.i0; i < c.i0 + c.w; i++) s.add(j * w + i); return s; }
  toSnapshot(): FoodCourtSnapshot { return { nextId: this.nextId, courts: this.list.map((c) => ({ ...c })) }; }
  fromSnapshot(s: FoodCourtSnapshot | undefined): void { this.list = (s?.courts ?? []).map((c) => ({ ...c })); this.nextId = s?.nextId ?? (this.list.reduce((m, c) => Math.max(m, c.id), 0) + 1); this.version++; }
}
