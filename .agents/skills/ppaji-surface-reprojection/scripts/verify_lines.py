from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,math
import argparse
ap=argparse.ArgumentParser();ap.add_argument('output');ap.add_argument('--spec',required=True);args=ap.parse_args();config=json.loads(Path(args.spec).read_text());colors={a['id']:a.get('outline_color',[62,60,45,255])[:3] for a in config['assets']}
C=Path(args.output).resolve();records=json.loads((C/'surface-lines.json').read_text());results=[]
for r in records:
 im=Image.open(C/r['id']/f"d{r['d']}.png").convert('RGBA');ar=np.array(im).astype(float);color=np.array(colors[r['id']]);overlay=im.copy();dr=ImageDraw.Draw(overlay);checks=[];seen=set()
 for line in r['visible_lines']:
  p,q=np.array(line['a']),np.array(line['b']);key=tuple(sorted([tuple(np.round(p,3)),tuple(np.round(q,3))]));
  if key in seen:continue
  seen.add(key);vec=q-p;length=np.linalg.norm(vec);n=np.array([-vec[1],vec[0]])/length;positions=np.linspace(.08,.92,max(12,int(length*.84/2)));offsets=np.linspace(-3,3,25);res=[];coverage=[]
  for t in positions:
   pts=p+t*vec+offsets[:,None]*n;xx=np.rint(pts[:,0]).astype(int);yy=np.rint(pts[:,1]).astype(int);pix=ar[yy,xx];dist=np.linalg.norm(pix[:,:3]-color,axis=1);weight=np.exp(-dist*dist/(2*24**2))*(pix[:,3]>200);coverage.append(float(weight.max())>.25)
   if weight.sum()>.1:res.append((t,float((offsets*weight).sum()/weight.sum())))
  if len(res)<8:continue
  t=np.array([a for a,b in res]);v=np.array([b for a,b in res]);m,b=np.polyfit(t,v,1);error=v-(m*t+b);rms=float(np.sqrt(np.mean(error**2))/4);maxerr=float(np.max(np.abs(error))/4);actualangle=math.degrees(math.atan2(vec[1],vec[0]));axiserr=min(abs((actualangle-angle+180)%360-180) for angle in [26.565051,-26.565051,90,-90,153.434949,-153.434949]);ok=rms<=.25 and maxerr<=.6 and np.mean(coverage)>=.90
  checks.append({'face':line['face'],'rms_logical_px':rms,'max_residual_logical_px':maxerr,'dark_line_coverage':float(np.mean(coverage)),'projected_axis_error_deg':axiserr,'pass':bool(ok)});dr.line([tuple(p),tuple(q)],fill=(20,180,150,200) if ok else (255,40,50,220),width=1)
 overlay.save(C/r['id']/f"d{r['d']}-lines.png");results.append({'id':r['id'],'d':r['d'],'line_count':len(checks),'failed_count':sum(not c['pass'] for c in checks),'checks':checks})
(C/'pixel-line-qa.json').write_text(json.dumps(results,indent=2));print([(r['id'],r['d'],r['line_count'],r['failed_count']) for r in results])

raise SystemExit(1 if any(r["failed_count"] or not r["line_count"] for r in results) else 0)
