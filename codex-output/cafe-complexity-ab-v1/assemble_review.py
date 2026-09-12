# coding: utf-8
from pathlib import Path
import argparse,shutil,json,hashlib,math
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--optimized',type=Path,required=True);p.add_argument('--publish',type=Path,required=True);a=p.parse_args()
base=Path(__file__).resolve().parent;dest=a.publish;media=dest/'review-media';media.mkdir(parents=True,exist_ok=True)
shutil.copy2(base/'baseline/concept.png',media/'concept.png');boxes=[]
for label,folder in [('before',a.baseline),('candidate',a.optimized)]:
 for profile in ['color','native']:
  for d in range(4):
   f=folder/f'{profile}-d{d}.png';im=Image.open(f);box=im.getchannel('A').getbbox();assert box
   q=im.width/192;boxes.append([v/q for v in box]);shutil.copy2(f,media/f'{label}-{profile}-d{d}.png')
left=max(0,math.floor(min(b[0] for b in boxes))-5);top=max(0,math.floor(min(b[1] for b in boxes))-5)
right=min(192,math.ceil(max(b[2] for b in boxes))+5);bottom=min(192,math.ceil(max(b[3] for b in boxes))+5)
w=right-left;h=bottom-top
source=base.parent/'toilet-skill-blackbox-v1/curation/optimization-compare/review.html'
html=source.read_text().replace('화장실','카페').replace('같은 2×2','같은 3×2').replace('짙은 회색 지붕, 크림 벽, 청록 타일과 빨강·파랑 문이 있는 카페 컨셉','기와지붕, 목재 골조, 파란 차양과 커피 창구가 있는 카페 컨셉')
html=html.replace('c.width=115*z;c.height=110*z',f'c.width={w}*z;c.height={h}*z').replace('40*q,35*q,115*q,110*q',f'{left}*q,{top}*q,{w}*q,{h}*q')
(dest/'review.html').write_text(html,encoding='utf-8')
checks={}
for lane in ['baseline','optimized']:
 d=base/lane;hashes=json.loads((d/'inputs-sha256.json').read_text());assert all(hashlib.sha256((d/k).read_bytes()).hexdigest()==v for k,v in hashes.items());checks[lane]={'frozen_files':len(hashes),'unchanged':True}
protected=json.loads((base/'protected-before.json').read_text());repo=base.parent.parent;assert all(hashlib.sha256((repo/k).read_bytes()).hexdigest()==v for k,v in protected.items())
(base/'review-preparation.json').write_text(json.dumps({'common_native_roi':[left,top,w,h],'image_count':16,'no_per_asset_fitting':True,'inputs':checks,'original_live_unchanged':len(protected),'published':str(dest)},indent=2))
print('Comparison ready; common ROI',[left,top,w,h])
