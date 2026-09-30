import { facilityPadding } from './facility-spacing.js';
import config from '../data/arrival-presentation.json';
import type { Game } from './game.js';
import { FLOOR, isIndoorCode, isWaterCode, shoreRow } from './grid.js';
import { FacilityStore } from './facility.js';
import { kitIndoorRect } from './startkit.js';

export const ARRIVAL_REVISION = 3;
/** Main room stays at row 8; revision 3 arrivals start on the roadside at row 0. */
export function arrivalRoom(gate: { i: number; j: number }) {
  return kitIndoorRect({ i: gate.i, j: gate.j === 0 ? 8 : gate.j });
}
export function arrivalRoute(gate: { i: number; j: number }): { i: number; j: number }[] {
  const room = arrivalRoom(gate);
  return Array.from({ length: room.j0 + room.h - gate.j }, (_, k) => ({ i: gate.i, j: gate.j + k + 1 }));
}

/** Adoption is permitted only for the original, unedited system starter map. */
export function canAdoptArrival(g: Game, original: Game): boolean {
  if (g.arrivalRevision || g.rank !== 0 || g.stats.spent > 0 || g.guests.count > 0) return false;
  if (g.facilities.all.length !== original.facilities.all.length) return false;
  for (const f of g.facilities.all) {
    const old = original.facilities.byUid(f.uid);
    if (!old || f.defId !== old.defId || f.i !== old.i || f.j !== old.j || f.facing !== old.facing || f.level !== 1) return false;
  }
  return g.grid.floor.every((v, k) => v === original.grid.floor[k]) && g.grid.levels.every((v, k) => v === original.grid.levels[k]);
}

/** Runs only on a new game or a checked clone. Never overwrites an edited park. */
export function applyArrivalLayout(g: Game): void {
  if (g.arrivalRevision >= ARRIVAL_REVISION) return;
  const gate = g.gate, room = arrivalRoom(gate);
  const right = room.i0 + room.w - 1, bottom = room.j0 + room.h - 1;
  const money = g.money;
  const paint = (i: number, j: number, code: typeof FLOOR.indoor | typeof FLOOR.path | typeof FLOOR.hall): void => {
    if (isWaterCode(g.grid.at(i, j)) || g.grid.levelAt(i, j) !== 0) throw new Error(`초기 출입동 평지 계약 위반: ${i},${j}`);
    g.grid.set(i, j, code);
  };
  // Preserve the starter main-room footprint and waterfront.
  for (let j = bottom + 1; j <= bottom + config.patio.depth; j++) for (let i = room.i0 - config.patio.sideWidth; i <= right + config.patio.sideWidth; i++) paint(i, j, FLOOR.path);
  for (let j = room.j0; j <= bottom; j++) for (let n = 1; n <= config.patio.sideWidth; n++) { paint(room.i0 - n, j, FLOOR.path); paint(right + n, j, FLOOR.path); }
  for (const f of [...g.facilities.all]) {
    if (f.defId === 'pyeongsang_row' || f.defId === 'pingpong') { g.facilities.remove(f.uid); continue; }
    if (f.defId === 'ticket') { g.facilities.move(f.uid, gate.i - 2, gate.j + 1, 0); f.passage = [[2, 0], [2, 1]]; }
    if (f.defId === 'indoor_shop') g.facilities.move(f.uid, gate.i - 3, room.j0 + 3, 0); // P57-c: 방이 정문 줄에서 시작하므로 +2 면 매표소(줄 9~10)와 겹친다 → 옛 킷 자리(줄 11)
    if (f.defId === 'toilet') g.facilities.move(f.uid, gate.i + 2, room.j0 + 4, 0);
  }
  const put = (name: string, i: number, j: number, facing: 0 | 1 = 0): void => {
    const id = `env_${name}`, def = g.facilities.def(id);
    if (!def) throw new Error(`초기 장식 정의 없음: ${id}`);
    const tiles = FacilityStore.footprint(def, i, j, facing);
    if (tiles.some(t => !g.ownsTile(t.i, t.j) || isIndoorCode(g.grid.at(t.i, t.j)) || isWaterCode(g.grid.at(t.i, t.j)) || g.facilities.occupied(t.i, t.j)
      || Math.abs(t.i - gate.i) <= Math.floor(config.patio.clearAisleWidth / 2) && t.j >= gate.j && t.j <= bottom + config.patio.depth
      || t.j >= shoreRow(t.i) - 2 /* P57-c: 물가 산책로 두 줄(P48-b3)은 비운다 — 20×13 건물에선 남쪽 장식 줄(21~23)이 산책로에 얹혀 잔교(선착장) 길을 끊었다(실측 코스 탑승 0) */)) return;
    if (!g.grid.levelUniform(i, j, facing ? def.d : def.w, facing ? def.w : def.d)) return;
    g.facilities.place(id, i, j, facing);
  };
  for (const m of config.wallModules) {
    const along = m.along < 0 ? room.w + m.along : m.along;
    const i = m.edge === 'west' ? room.i0 - m.outward : m.edge === 'east' ? right + m.outward : room.i0 + along;
    const j = m.edge === 'south' ? bottom + m.outward : room.j0 + m.along;
    // The new engine has two physical rotations; west/east bench silhouettes share that axis.
    put(m.kind, i, j, (m.facing % 2) as 0 | 1);
  }
  for (const side of [-1, 1]) {
    const edge = side < 0 ? room.i0 : right;
    put('flower_pot', gate.i + side * 3, room.j0 - 1);
    put('deciduous', edge + side * 4, room.j0 + 3);
    put('shrubs', edge + side * 3, room.j0 + 5);
    put('pine', edge + side * 5, bottom + 1);
    put('rocks', edge + side * 4, bottom + 4);
  }
  // P58-a D8: 킷 푸드코트 3×4(식탁 2 · 좌석 4) — 출입동 안, 매표소 오른쪽 아래. 돈은 아래에서 되돌린다
  { const r = g.makeFoodCourt({ i0: gate.i + 4, j0: gate.j + 2, w: 3, h: 4 }); if (!r.ok) throw new Error(`킷 푸드코트: ${r.reason}`); }
  // Compact annex occupies the former approach plaza. The two road lanes now
  // continue above the grid (-2/-1), with an in-grid sidewalk and spawn at row 0.
  for (let j = 0; j < 8; j++) for (let i = 0; i < g.grid.w; i++) g.grid.set(i, j, j === 0 ? FLOOR.path : FLOOR.grass);
  for (let j = 3; j < 8; j++) for (let i = gate.i - 4; i < gate.i + 4; i++) paint(i, j, FLOOR.indoor);
  for (let j = 1; j <= bottom; j++) {
    paint(gate.i, j, j < 3 ? FLOOR.path : FLOOR.hall);
    if (j >= 3 && (j < 5 || j > 6)) paint(gate.i + 1, j, FLOOR.hall);
  }
  for (const f of [...g.facilities.all]) if (f.defId === 'ticket') g.facilities.remove(f.uid);
  const ticket = g.facilities.place('compact_ticket', gate.i, 1, 0);
  ticket.passage = [[0, 0], [0, 1]];
  g.facilities.place('compact_locker', gate.i - 4, 3, 0);
  g.facilities.place('compact_changing', gate.i - 4, 6, 0);
  g.facilities.place('compact_shower', gate.i + 1, 5, 0);
  // Preserve the two-cell circulation aisle; move the tall toilet away from tables.
  for(const f of g.facilities.all){
    if(f.defId==='indoor_shop')g.facilities.move(f.uid,gate.i-5,room.j0+3,0);
    if(f.defId==='toilet')g.facilities.move(f.uid,gate.i+2,room.j0+7,0);
    if(f.defId==='env_bench' && f.i===39 && f.j===22)g.facilities.move(f.uid,36,21,f.facing);
    if(f.defId==='env_shrubs' && f.j===13)g.facilities.move(f.uid,f.i<gate.i?33:62,14,f.facing);
    const pad=facilityPadding(g.facilities.defOf(f));if(pad)f.padding=pad;
  }
  g.arrivalRevision = ARRIVAL_REVISION;
  g.money = money;
  g.finalizeArrivalLayout();
  g.drainFx();
}
