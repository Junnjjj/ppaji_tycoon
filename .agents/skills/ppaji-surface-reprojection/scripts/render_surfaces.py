#!/usr/bin/env python3
"""Render canonical textured quadrilateral assemblies; no screen-space piecewise warp."""
from pathlib import Path
import argparse,json,math,hashlib
import numpy as np
from PIL import Image,ImageDraw
ap=argparse.ArgumentParser();ap.add_argument('spec');ap.add_argument('--out',required=True);args=ap.parse_args()
SPEC=Path(args.spec).resolve();config=json.loads(SPEC.read_text());C=Path(args.out).resolve();C.mkdir(parents=True,exist_ok=True)
assert config.get('density',4)==4 and config.get('supersample',2)==2,'This renderer supports density 4 / SSAA 2'
meta={a['id']:a for a in config['assets']}
def inverse_h(dst,source):
 A=[];b=[]
 for (x,y),(u,v) in zip(dst,source):A.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);b.extend([u,v])
 return np.linalg.solve(np.array(A,float),np.array(b,float))
allqa=[]
for id,asset in meta.items():
 (C/id).mkdir(exist_ok=True);faces=asset['faces'];textures={}
 for face in faces:
  q=np.array(face['vertices'],float)
  if q.shape!=(4,3) or not np.isfinite(q).all():raise ValueError('Invalid quad '+face['name'])
  normal=np.cross(q[1]-q[0],q[2]-q[0])
  if np.linalg.norm(normal)<1e-8 or abs(np.dot(normal,q[3]-q[0]))>1e-6:raise ValueError('Nonplanar/degenerate quad '+face['name'])
 if len(asset['frames'])!=4:raise ValueError('Four registrations required')
 for name,t in asset['textures'].items():
  p=(SPEC.parent/t['file']).resolve()
  if t.get('sha256') and hashlib.sha256(p.read_bytes()).hexdigest()!=t['sha256']:raise ValueError('Texture changed: '+str(p))
  textures[name]=(Image.open(p).convert('RGBA'),t['quad'])
 (C/f'{id}-assembly.json').write_text(json.dumps(faces,indent=2))
 for d,f in enumerate(meta[id]['frames']):
  W,H=[n*2 for n in config.get("packed_canvas",[768,768])];out=np.zeros((H,W,4),np.uint8);zbuf=np.full((H,W),-1e10);lines=[];visible_lines=[];w,h=asset['size']
  def rotate(q):
   u,v,z=q;a,b=[(u,v),(v,w-u),(w-u,h-v),(h-v,u)][d];return(a,b,z)
  def face_vertices(face):
   if 'camera_facing' not in face:return [rotate(q) for q in face['vertices']]
   b=face['camera_facing'];u,v,z=rotate(b['center']);du=b['width']/64;hh=b['height']/2
   return [(u-du,v+du,z+hh),(u+du,v-du,z+hh),(u+du,v-du,z-hh),(u-du,v+du,z-hh)]
  def project(q):
   u,v,z=q;return((16*(u-v)-f['left'])*8,(8*(u+v)-z-f['top'])*8)
  for face in faces:
   vs=face_vertices(face);ps=[project(q) for q in vs];xs=[p[0] for p in ps];ys=[p[1] for p in ps];x0=max(0,math.floor(min(xs))-2);y0=max(0,math.floor(min(ys))-2);x1=min(W,math.ceil(max(xs))+3);y1=min(H,math.ceil(max(ys))+3)
   if x1<=x0 or y1<=y0:continue
   local=[(x-x0,y-y0) for x,y in ps];cw,ch=x1-x0,y1-y0;mask=Image.new('L',(cw,ch));ImageDraw.Draw(mask).polygon(local,fill=255);mask=np.array(mask)>0
   try:coef=np.linalg.lstsq(np.array([[x,y,1] for x,y in ps]),np.array([u+v+z/32 for u,v,z in vs]),rcond=None)[0]
   except Exception:continue
   yy,xx=np.mgrid[y0:y1,x0:x1];depth=coef[0]*xx+coef[1]*yy+coef[2]
   mat=face['material']
   if mat in textures:
    im,quad=textures[mat];cf=inverse_h(local,quad);paint=np.array(im.transform((cw,ch),Image.Transform.PERSPECTIVE,tuple(cf),Image.Resampling.BICUBIC))
   else:paint=np.array(Image.new('RGBA',(cw,ch),mat))
   hit=mask&(depth>zbuf[y0:y1,x0:x1]+1e-6)&(paint[:,:,3]>5)
   out[y0:y1,x0:x1][hit]=paint[hit];zbuf[y0:y1,x0:x1][hit]=depth[hit]
   for k in range(4):
    p,q=ps[k],ps[(k+1)%4];lines.append({'face':face['name'],'a':[v/2 for v in p],'b':[v/2 for v in q]})
  # Z-tested visible outlines follow the actual face boundaries, never image columns.
  for face in faces:
   vs=face_vertices(face);ps=[project(q) for q in vs]
   for k in range(4):
    if k in face.get('skip_outline_edges',[]):continue
    p0,p1=ps[k],ps[(k+1)%4];v0,v1=vs[k],vs[(k+1)%4]
    n=max(2,int(math.hypot(p1[0]-p0[0],p1[1]-p0[1])*2));ts=np.linspace(0,1,n)
    xx=np.rint(p0[0]+ts*(p1[0]-p0[0])).astype(int);yy=np.rint(p0[1]+ts*(p1[1]-p0[1])).astype(int)
    z0=v0[0]+v0[1]+v0[2]/32;z1=v1[0]+v1[1]+v1[2]/32;zz=z0+ts*(z1-z0)
    visible=(zz>=zbuf[np.clip(yy,0,H-1),np.clip(xx,0,W-1)]-.035)
    if visible.mean()>.90 and math.hypot(p1[0]-p0[0],p1[1]-p0[1])>80:visible_lines.append({'face':face['name'],'a':[v/2 for v in p0],'b':[v/2 for v in p1]})
    col=tuple(asset.get('outline_color',[62,60,45,255]))
    for dx,dy in [(dx,dy) for dx in range(-2,3) for dy in range(-2,3) if dx*dx+dy*dy<=4]:
     x=xx+dx;y=yy+dy;valid=(x>=0)&(x<W)&(y>=0)&(y<H);x=x[valid];y=y[valid];z=zz[valid];vis=z>=zbuf[y,x]-.035;out[y[vis],x[vis]]=col
  im=Image.fromarray(out).resize(tuple(config.get("packed_canvas",[768,768])),Image.Resampling.LANCZOS);im.save(C/id/f'd{d}.png');allqa.append({'id':id,'d':d,'lines':lines,'visible_lines':visible_lines})
 # contact board at packed density
 board=Image.new('RGB',(1280,340),'#e1e8d7');dr=ImageDraw.Draw(board)
 for d in range(4):
  im=Image.open(C/id/f'd{d}.png');im=im.crop(im.getbbox());im.thumbnail((295,300));board.paste(im,(d*320+(320-im.width)//2,25),im);dr.text((d*320+10,5),id+' d'+str(d),fill='black')
 board.save(C/f'{id}-surface-board.png')
(C/'surface-lines.json').write_text(json.dumps(allqa,indent=2))
print(str(len(meta)*4)+' textured surface renders')
