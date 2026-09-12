from pathlib import Path
import hashlib,json,shutil
from PIL import Image
p=Path(__file__).resolve().parent
repo=p.parent.parent
r={}
for name,base in [('inputs-sha256.json',p),('protected-before.json',repo)]:
 data=json.loads((p/name).read_text());bad=[str(base/k) for k,v in data.items() if not (base/k).is_file() or hashlib.sha256((base/k).read_bytes()).hexdigest()!=v];r[name]={'count':len(data),'changed':bad};assert not bad
media=p/'review/review-media'
for profile in ['color','native']:
 for d in range(4): shutil.copy2(p/'output'/f'{profile}-d{d}.png',media/f'candidate-{profile}-d{d}.png')
alpha={}
for f in sorted(media.glob('*-d*.png')):
 im=Image.open(f);box=im.getchannel('A').getbbox();q=im.width/192
 assert box and box[0]>=40*q and box[1]>=35*q and box[2]<=155*q and box[3]<=145*q, (f,box)
 alpha[f.name]={'size':im.size,'alpha_bbox':box,'common_roi_contains_alpha':True}
r['comparison_images']=alpha
(p/'preservation-check.json').write_text(json.dumps(r,indent=2))
print(json.dumps({'protected':r['protected-before.json'],'inputs':r['inputs-sha256.json'],'images':len(alpha)},indent=2))
