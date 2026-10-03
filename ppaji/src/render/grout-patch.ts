import measured from './grout-lines.json';

type Line = { intercept: number; slope: number };
const make = (n: number) => Object.assign(document.createElement('canvas'), { width: n, height: n });
function intersection(x: Line, y: Line): [number, number] {
 const u = (x.intercept + x.slope * y.intercept) / (1 - x.slope * y.slope);
 return [u, y.intercept + y.slope * u];
}

/** Approved UV reconstruction. Each painted slab occupies exactly one world cell.
 * Keep the original RGBA and reflected eight-cell period; never draw a second grid
 * over the old grout. Fitted source boundaries also remove the broad source skew.
 */
export function alignGrout(source: HTMLCanvasElement, material: 'path' | 'indoor'): HTMLCanvasElement {
 const lines = measured[material], n = 512, block = 128;
 const src = source.getContext('2d')!.getImageData(0, 0, 414, 414).data;
 const flat = make(n), ctx = flat.getContext('2d')!, out = ctx.createImageData(n, n);
 // Cropped outer grout is incomplete in both materials. Reuse complete inner
 // slab intervals so the reflected edges do not become thin or double joints.
 const order = material === 'indoor' ? [1, 2, 3, 2] : [1, 2, 1, 2];
 for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
  const a = order[i]!, b = order[j]!;
  const corners = [intersection(lines.x[a]!, lines.y[b]!), intersection(lines.x[a+1]!, lines.y[b]!), intersection(lines.x[a+1]!, lines.y[b+1]!), intersection(lines.x[a]!, lines.y[b+1]!)];
  for (let y = 0; y < block; y++) for (let x = 0; x < block; x++) {
   const u = (x + .5) / block, v = (y + .5) / block;
   const weights = [(1-u)*(1-v),u*(1-v),u*v,(1-u)*v];
   const sx = Math.max(0,Math.min(413,corners.reduce((s,p,k)=>s+p[0]*weights[k]!,0)));
   const sy = Math.max(0,Math.min(413,corners.reduce((s,p,k)=>s+p[1]*weights[k]!,0)));
   const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(413,x0+1),y1=Math.min(413,y0+1),dx=sx-x0,dy=sy-y0;
   const k=((j*block+y)*n+i*block+x)*4;
   for(let c=0;c<4;c++)out.data[k+c]=src[(y0*414+x0)*4+c]!*(1-dx)*(1-dy)+src[(y0*414+x1)*4+c]!*dx*(1-dy)+src[(y1*414+x0)*4+c]!*(1-dx)*dy+src[(y1*414+x1)*4+c]!*dx*dy;
  }
 }
 ctx.putImageData(out,0,0);
 const patch=make(n*2),p=patch.getContext('2d')!;
 for(let v=0;v<2;v++)for(let u=0;u<2;u++){p.save();p.translate(u?n*2:0,v?n*2:0);p.scale(u?-1:1,v?-1:1);p.drawImage(flat,0,0);p.restore();}
 return patch;
}
