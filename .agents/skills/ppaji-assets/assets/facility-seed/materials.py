import numpy as np
from PIL import ImageColor

def finish(face,world,rgba,d):
 n=face['name'];u,v,z=world;rgb=rgba[:,:,:3].astype(float);grain=(np.sin(u*213+v*113+z*5)+np.sin(u*357-v*167+z*8))*.4;broad=(np.sin(u*38+v*23+z*.7)+np.sin(u*68-v*52+z*1.3))*.65
 if n.startswith('vest-'):
  x=(u-face['vest_center'])/.16;front='-front' in n;back='-back' in n;bevel='bevel' in n or '-edge/' in n;base=np.array(ImageColor.getrgb(face['vest_color']),float)
  rgb=np.broadcast_to(base,rgb.shape).copy();rgb*=face.get('shade',[1]*4)[d]
  bulge=.88+.14*np.maximum(0,1-x*x);rgb*=bulge[:,:,None];rgb+=np.exp(-((x+.40)/.26)**2)[:,:,None]*np.array([13,13,10]);rgb+=(broad*.7+grain*.5)[:,:,None]
  rgb*=(1-.16*np.exp(-np.maximum(z-10.75,0)/.45)-.13*np.exp(-np.maximum(22.6-z,0)/.65))[:,:,None]
  # Painted edge follows the entire jacket outline, including neck and arm openings.
  poly=np.array([(-.14,10.75),(.14,10.75),(.16,11.3),(.16,17.15),(.115,17.15),(.115,20.85),(.068,22.60),(.031,22.35),(.026,21.25),(-.026,21.25),(-.031,22.35),(-.068,22.60),(-.115,20.85),(-.115,17.15),(-.16,17.15),(-.16,11.3)])
  dist=np.full(u.shape,1000.)
  for k,p0 in enumerate(poly):
   p1=poly[(k+1)%len(poly)];dx,dz=(p1-p0)*[32,1];xx,zz=(u-face['vest_center']-p0[0])*32,z-p0[1];tt=np.clip((xx*dx+zz*dz)/(dx*dx+dz*dz),0,1);dist=np.minimum(dist,np.hypot(xx-tt*dx,zz-tt*dz))
  rgb*=(1-.28*np.exp(-dist/.27))[:,:,None]
  if bevel:rgb*=.86
  if front and not bevel:
   seam=(np.abs(x)<.035)&(z<20.3)&(z>11.2);rgb[seam]*=.66
   for level in [14.2,17.05]:
    belt=np.abs(z-level)<.36;rgb[belt]=np.array([37,43,36])+(broad[belt]*.3)[:,None]
    buckle=(np.abs(x)<.19)&(np.abs(z-level)<.25);rgb[buckle]=[223,220,183]
    hole=(np.abs(x)<.085)&(np.abs(z-level)<.13);rgb[hole]=[57,60,47]
  rgba[:,:,:3]=np.uint8(np.clip(np.rint(rgb),0,255));return rgba
 if n.startswith('dryer-'):
  rgb+=(broad*.5+grain*.3)[:,:,None]
  if '-body/' in n or '-nozzle/' in n:rgb+=(np.exp(-((z-17.85)/.52)**2)*12)[:,:,None]
  if '-handle/' in n:rgb*=.91
  rgba[:,:,:3]=np.uint8(np.clip(np.rint(rgb),0,255));return rgba
 q=np.array(face['vertices']);p=q[0];basis=np.linalg.pinv(np.array([q[1]-p,q[3]-p]).T);s,t=np.einsum('ij,jkl->ikl',basis,world-p[:,None,None]);edge=np.minimum.reduce([s,1-s,t,1-t])
 if n.startswith('wood-'):
  top=n.endswith('/top');rgb*=(1-(.32 if top else .49)*np.exp(-np.maximum(edge,0)/.046))[:,:,None]
  rgb+=(np.exp(-((s-.16)/.055)**2)*(12 if 'post' in n or 'leg' in n else 5)+grain+broad)[:,:,None]
  if 'mirror-back' in n:rgb+=(np.sin(s*26)*2+np.sin(z*.8+u*28))[:,:,None]
 elif n.startswith('glass-'):
  rgb=np.broadcast_to(np.array([44.,139,165]),rgb.shape).copy();rgb+=(s*12-t*13)[:,:,None]
  stripe=np.exp(-((s+t*.90-.87)/.10)**2);rgb+=stripe[:,:,None]*np.array([44,76,76]);rgb+=(grain*.18)[:,:,None];rgb*=(1-.15*np.exp(-np.maximum(edge,0)/.038))[:,:,None]
 elif n.startswith('cream-'):
  rgb*=(1-.11*np.exp(-np.maximum(edge,0)/.065))[:,:,None];rgb+=(grain*.3+broad*.4)[:,:,None]
  if n=='cream-apron-front/front':
   slots=(np.mod((u-.27)*7.2,1)<.43)&(z>9.15)&(z<12.30);rgb[slots]=[40,94,106]
 elif n.startswith('folded-'):
  rgb*=(1-.25*np.exp(-np.maximum(edge,0)/.08))[:,:,None]
 rgba[:,:,:3]=np.uint8(np.clip(np.rint(rgb),0,255));return rgba
