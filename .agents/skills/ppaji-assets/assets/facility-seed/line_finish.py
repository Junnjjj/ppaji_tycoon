import numpy as np
from PIL import Image,ImageFilter

def line_finish(out,labels,groups,size):
 # A 2-packed-pixel line grid. Only coverage/line decisions are discretized;
 # full-resolution surface paint is retained without downsampling the sprite.
 grid=labels[2::4,2::4].copy()
 fine_ids=[n for name,n in groups.items() if name.startswith('hanger-')]
 fine=np.isin(labels[1::2,1::2],fine_ids)
 grid[np.isin(grid,fine_ids)]=0
 m=grid>0
 outer=np.array(Image.fromarray(m.astype('uint8')*255).filter(ImageFilter.MaxFilter(3)))>0
 h,w=m.shape
 # One grid cell on each directed boundary; opacity separates inner ink from silhouette.
 edge=np.zeros_like(m)
 edge[:,1:]|=(grid[:,1:]!=grid[:,:-1])&m[:,1:]&m[:,:-1]
 edge[1:,:]|=(grid[1:,:]!=grid[:-1,:])&m[1:,:]&m[:-1,:]
 mask=np.repeat(np.repeat(m,2,0),2,1);expanded=np.repeat(np.repeat(outer,2,0),2,1);internal=np.repeat(np.repeat(edge,2,0),2,1)
 # Extend RGB into newly covered edge cells using adjacent painted pixels only.
 color=np.array(Image.fromarray(out).resize(size,Image.Resampling.LANCZOS)).astype(float)
 valid=color[:,:,3]>200
 rgb=color[:,:,:3].copy()
 for _ in range(4):
  total=np.zeros_like(rgb);count=np.zeros(valid.shape)
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
   vv=np.roll(valid,(dy,dx),(0,1));cc=np.roll(rgb,(dy,dx),(0,1));total+=cc*vv[:,:,None];count+=vv
  take=(~valid)&(count>0);rgb[take]=total[take]/count[take,None];valid|=take
 ink=np.array([34.,24.,16.])
 rgb[internal]=rgb[internal]*.37+ink*.63
 inner=mask.copy()
 if any(name.startswith('wood-mirror') for name in groups):
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:inner &= np.roll(mask,(dy,dx),(0,1))
 rgb[expanded&~inner]=ink
 rgb[fine]=color[:,:,:3][fine]*.85
 expanded|=fine
 alpha=np.array(Image.fromarray(expanded.astype('uint8')*255).filter(ImageFilter.GaussianBlur(.20)))
 result=np.dstack([np.uint8(np.clip(np.rint(rgb),0,255)),alpha]);result[alpha==0,:3]=0
 return Image.fromarray(result)
