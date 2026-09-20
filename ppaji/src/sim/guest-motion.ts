/** Fixed world speed, including old saves with multi-tile interpolation spans. */
export function movementFacing(fromI:number,fromJ:number,i:number,j:number,fallback:0|1|2|3=0):0|1|2|3 {
  const di=i-fromI,dj=j-fromJ;
  return Math.abs(di)+Math.abs(dj)<1e-9?fallback:Math.abs(di)>=Math.abs(dj)?(di>0?0:2):(dj>0?1:3);
}
export function advanceGuestMovement(g:{fromI:number;fromJ:number;i:number;j:number;progress:number;facing:0|1|2|3},ticksPerTile:number):void {
  const distance=Math.hypot(g.i-g.fromI,g.j-g.fromJ);
  g.facing=movementFacing(g.fromI,g.fromJ,g.i,g.j,g.facing);
  g.progress=Math.min(1,g.progress+1/Math.max(1,distance*ticksPerTile));
}
