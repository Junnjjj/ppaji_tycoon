import { expect, it } from 'vitest';
import { continuousWalk } from './walk-continuity.js';
import { KairoTerrain } from '../../sim/kairo/terrain.js';
import { movementLevel, SLOPE_UP } from '../../sim/kairo/slopes.js';

it('carries the last displayed position across an early sim tick and reaches the true endpoint', () => {
  const previous = continuousWalk(undefined, 'a>b', .96, 15.36, -7.68);
  const next = continuousWalk(previous, 'b>c', .02, 16.32, -8.16);
  expect(next.x).toBeCloseTo(previous.x, 12);
  expect(next.y).toBeCloseTo(previous.y, 12);
  const end = continuousWalk(next, 'b>c', 1, 32, -16);
  expect([end.x,end.y]).toEqual([32,-16]);
});

it.each([0,1,2,3] as const)('has no quantized height jumps on either ramp or stair in facing %s, both directions', facing => {
  const [di,dj]=SLOPE_UP[facing];
  for(const kind of ['path_ramp','path_steps']) {
    const t=new KairoTerrain(12,12);
    t.paint(6,6,kind);t.setLevel(6+di,6+dj,1);
    for(const sign of [-1,1]) {
      let last:number|undefined;
      for(let n=0;n<=3000;n++) {
        const distance=-1.5+n/1000, v=distance*sign;
        const seg=v<0?-1:0, p=v-seg;
        // Sample all three tiles along the crossing, with no terrain mutation between samples.
        const height=movementLevel(t,6+di*seg,6+dj*seg,6+di*(seg+1),6+dj*(seg+1),p)*16;
        if(last!==undefined)expect(Math.abs(height-last),`${kind}/${sign}/${n}`).toBeLessThan(.06);
        last=height;
      }
    }
  }
});

it('keeps real GuestStore tick changes continuous with uneven render frame timing on a slope', async () => {
  const { GuestStore, GUEST_DEFAULTS } = await import('../../sim/kairo/guests.js');
  const { PlacementGrid } = await import('../../sim/kairo/placement.js');
  const { WallGrid } = await import('../../sim/kairo/walls.js');
  const { Rng } = await import('../../sim/rng.js');
  const t = new KairoTerrain(16,16), rng = new Rng(51);
  for(let i=4;i<=10;i++){t.paint(i,8,'path_stone');t.setLevel(i,8,i>7?1:0);}
  t.paint(7,8,'path_steps');
  const store = new GuestStore(t,new WallGrid(16,16),new PlacementGrid(16,16),{i:4,j:8},GUEST_DEFAULTS);
  const g=store.spawn(rng)!; Object.assign(g,{i:10,j:8,fromI:10,fromJ:8,state:'leaving',pose:'walk',progress:1});
  let sample: ReturnType<typeof continuousWalk>|undefined, clock=0, changes=0, maxDelta=0;
  for(let frame=0;frame<400;frame++) {
    const dt=[16,17,25,12][frame%4]!;
    clock+=dt;
    while(clock>=200){store.tick(rng);clock-=200;}
    if(!store.all.includes(g))break;
    store.advanceRenderProgress(dt/1000,.2);
    const p=g.progress, i=g.fromI+(g.i-g.fromI)*p,j=g.fromJ+(g.j-g.fromJ)*p;
    const segment=`${g.fromI},${g.fromJ}>${g.i},${g.j}`;
    const next=continuousWalk(sample,segment,p,16*(i-j),8*(i+j+1)-16*movementLevel(t,g.fromI,g.fromJ,g.i,g.j,p));
    if(sample){
      const delta=Math.hypot(next.x-sample.x,next.y-sample.y);maxDelta=Math.max(maxDelta,delta);
      if(sample.segment!==segment){changes++;expect(delta).toBeLessThan(1e-8);}
    }
    sample=next;
  }
  expect(changes).toBeGreaterThan(3);
  expect(maxDelta).toBeLessThan(2);
});
