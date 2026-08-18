import { Rng } from '../src/sim/rng.js';
import { KairoTerrain } from '../src/sim/kairo/terrain.js';
import { WallGrid } from '../src/sim/kairo/walls.js';
import { PlacementGrid, allFacilityDefs } from '../src/sim/kairo/placement.js';
import { GRADES, landRect, requiredGrade } from '../src/sim/kairo/progress.js';
import { mapType } from '../src/sim/kairo/scenario.js';
import { GRID_W, GRID_H } from '../src/render/kairo/iso.js';

const GATE = { i: 0, j: 0 };
for (const id of ['bukhan', 'valley', 'lake']) {
  let map;
  try { map = mapType(id); } catch { continue; }
  const t = KairoTerrain.generate(GRID_W, GRID_H, new Rng(20260818).fork(1), map);
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  const g1 = GRADES[0]!;
  const land = landRect(g1);
  const ok: string[] = [], byFail = new Map<string, number>();
  for (const d of allFacilityDefs()) {
    if (requiredGrade(d.id) > g1.grade) { byFail.set('등급', (byFail.get('등급') ?? 0) + 1); continue; }
    let placed = false;
    for (let j = 0; j < land.h - d.size[1] && !placed; j++) {
      for (let i = 0; i < land.w - d.size[0]; i++) {
        if (p.check(t, w, GATE, d.id, i, j, { land }).ok) { placed = true; break; }
      }
    }
    if (placed) ok.push(d.id);
    else {
      const r = p.check(t, w, GATE, d.id, 2, 2, { land });
      byFail.set(r.fail ?? '?', (byFail.get(r.fail ?? '?') ?? 0) + 1);
    }
  }
  const land0 = land;
  console.log(`${map.name.padEnd(6)} 토지 ${land0.w}×${land0.h} · 1등급에 놓을 수 있는 시설 ${ok.length}종`);
  console.log(`   못 놓는 이유: ${[...byFail].map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   가능: ${ok.slice(0, 12).join(', ')}${ok.length > 12 ? ' …' : ''}`);
}
