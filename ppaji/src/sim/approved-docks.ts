import { FLOOR, type Grid } from './grid.js';
import { FacilityStore } from './facility.js';

/** Reuse two existing deck cells; never paint terrain or overwrite a neighbouring facility. */
export function adoptApprovedDocks(facilities: FacilityStore, grid: Grid): number {
  const saved = facilities.toSnapshot();
  let count = 0;
  for (const f of saved.list) {
    if (f.defId !== 'dock') continue;
    const candidates = [
      {i:f.i,j:f.j-1,facing:1 as const},
      {i:f.i-1,j:f.j,facing:0 as const},
      {i:f.i,j:f.j,facing:1 as const},
      {i:f.i,j:f.j,facing:0 as const},
    ];
    const def = facilities.def('boarding_dock');
    if (!def) continue;
    for (const c of candidates) {
      const tiles=FacilityStore.footprint(def,c.i,c.j,c.facing);
      if (!grid.levelUniform(c.i,c.j,c.facing?1:2,c.facing?2:1)) continue;
      if (!tiles.every(t=>grid.inside(t.i,t.j)&&grid.at(t.i,t.j)===FLOOR.deck&&(!facilities.at(t.i,t.j)||facilities.at(t.i,t.j)?.uid===f.uid))) continue;
      Object.assign(f,{defId:'boarding_dock',...c,passage:[[0,0],[1,0]] as [number,number][]});
      count++;
      // Reserve each conversion before considering another nearby legacy dock.
      facilities.fromSnapshot(saved);
      break;
    }
  }
  return count;
}
