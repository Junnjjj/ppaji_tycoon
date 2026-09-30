from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib
root=Path.cwd();out=root/'codex-output/facility-reaudit-20260929';base=root/'codex-output/footprint-spacing-review-20260925';main=Path('/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji/public/assets/imagegen-art-v1');manifest=json.loads((main/'manifest.json').read_text());rows=json.loads((root/'codex-output/facility-direction-audit-20260927/results.json').read_text())['rows'];result=[];panels=[]
for r in rows:
 row=dict(id=r['id'],name=r['name'],reviewNo=r.get('reviewNo'),auditNo=r['auditNo'],frames=[])
 panel=Image.new('RGB',(1280,450),'#dbe1dd');draw=ImageDraw.Draw(panel);draw.text((10,4),f"{r.get('reviewNo')} {r['id']} | top: source reference; bottom: CURRENT MAIN",fill='black')
 for d,f in enumerate(r['frames']):
  key=f"fac/{r['id']}/{d}";e=manifest['entries'][key];p=main/e['file'];current=Image.open(p).convert('RGBA');orig=(base/'direction-audit'/f['original']).resolve();ref=Image.open(orig).convert('RGBA');pad=e.get('pad',0);expected=(e['w'],e['h']);valid=ref.size==expected
  # Source native image retains its full canvas. Uniform density conversion only.
  if valid:
   full=Image.new('RGBA',current.size);full.alpha_composite(ref.resize((ref.width*4,ref.height*4),Image.Resampling.NEAREST),(pad*4,pad*4));ref=full
  elif ref.size!=current.size:
   row['frames'].append(dict(direction=d,status='REFERENCE_CANVAS_MISMATCH',source=str(orig),sourceSize=ref.size,currentSize=current.size));continue
  def box(im): return im.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
  a,b=box(ref),box(current);wr=(b[2]-b[0])/(a[2]-a[0]);hr=(b[3]-b[1])/(a[3]-a[1]);shift=[(b[0]+b[2]-a[0]-a[2])/8,(b[1]+b[3]-a[1]-a[3])/8];bottom=(b[3]-a[3])/4
  flagged=max(abs(wr-1),abs(hr-1))>.05 or max(map(abs,shift))>2 or abs(bottom)>2
  row['frames'].append(dict(direction=d,status='REVIEW_REQUIRED' if flagged else 'WITHIN_BOUNDS_NOT_SEMANTIC_PASS',source=str(orig),current=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),widthRatio=round(wr,4),heightRatio=round(hr,4),centerShiftLogical=shift,bottomShiftLogical=bottom,referenceBBox=a,currentBBox=b))
  # Same scale and crop for reference/current; no independent fit.
  union=(min(a[0],b[0])-12,min(a[1],b[1])-12,max(a[2],b[2])+12,max(a[3],b[3])+12);scale=min(290/(union[2]-union[0]),185/(union[3]-union[1]));sz=(round((union[2]-union[0])*scale),round((union[3]-union[1])*scale))
  for n,img in enumerate([ref,current]):
   thumb=img.crop(union).resize(sz,Image.Resampling.LANCZOS);panel.paste(thumb,(d*320+(320-sz[0])//2,35+n*205+(185-sz[1])//2),thumb)
  draw.text((d*320+8,21),f'D{d} W {wr:.2f} H {hr:.2f} dy {bottom:.1f}',fill='red' if flagged else 'black')
 result.append(row);panels.append(panel)
for i in range(0,len(panels),4):
 board=Image.new('RGB',(1280,450*len(panels[i:i+4])),'white')
 for n,p in enumerate(panels[i:i+4]):board.paste(p,(0,n*450))
 board.save(out/f'board-{i//4+1:02}.jpg',quality=90)
(out/'results.json').write_text(json.dumps({'scope':'100 facilities x4; registered source-native comparison, geometry screening not approval','rows':result},ensure_ascii=False,indent=2))
print('facilities',len(result),'frames',sum(len(r['frames']) for r in result));print('flagged',sum(any(f['status']=='REVIEW_REQUIRED' for f in r['frames']) for r in result),'frames',sum(f['status']=='REVIEW_REQUIRED' for r in result for f in r['frames']));print('mismatch',[(r['id'],f['direction']) for r in result for f in r['frames'] if f['status']=='REFERENCE_CANVAS_MISMATCH'])
