import { expect, it } from 'vitest';
import { KairoTerrain } from '../../sim/kairo/terrain.js';
import { SLOPE_UP } from '../../sim/kairo/slopes.js';
import { heightTileAt } from './height.js';
import { tileCenter } from './iso.js';
it('selects raised flat tiles and all four ramp surfaces at their displayed centre',()=>{
 for(const [f,[di,dj]] of SLOPE_UP.entries()){
  const t=new KairoTerrain(12,12);t.setLevel(6+di,6+dj,1);t.paint(6,6,'path_ramp');
  const p=tileCenter(6,6);
  // +I/+J rises are edge-on at this camera; their centre lies on the near upper tile.
  expect(heightTileAt(t,p.x,p.y-8,16)).toEqual(f === 0 || f === 3 ? {i:6+di,j:6+dj} : {i:6,j:6});
  const q=tileCenter(6+di,6+dj);
  expect(heightTileAt(t,q.x,q.y-16,16)).toEqual({i:6+di,j:6+dj});
 }
});
