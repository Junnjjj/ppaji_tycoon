import json,math,hashlib,struct
from pathlib import Path
P=Path(__file__).resolve().parent;B=P.parents[2];M=Path('/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji');A=M/'public/assets/approved-facilities'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
e=json.loads((P/'evidence.json').read_text());data=json.loads((M/'src/data/facility-attendants.json').read_text());metrics={}
assert set(data)==set(e)
for f,a in data.items():
 r=e[f];assert sha(Path(r['sourceBlend']))==a['sourceSHA']==r['sourceSHA'];assert a['uid'] < -100000 and a['pose']=='idle'
 for name,h in r['nativeHashesBefore'].items():assert sha(A/f/name)==h
 for d in r['directions']:
  for name,h in d['files'].items():
   p=A/f/name;assert sha(p)==h and p.stat().st_size==192*192*4
   vals=struct.unpack('<36864f',p.read_bytes());assert not any(math.isnan(x) for x in vals)
 inter=json.loads((Path(r['sourceBlend']).parent/'interaction.json').read_text());x,y,z=a['position'];radius=.18
 distance=lambda p,q:math.dist(p[:2],q[:2])
 clear=[]
 for ob in inter['obstacles']:
  dx=max(ob['min'][0]-x,0,x-ob['max'][0]);dy=max(ob['min'][1]-y,0,y-ob['max'][1]);clear.append({'object':ob['name'],'bodyClearanceTiles':math.hypot(dx,dy)-radius})
 assert all(v['bodyClearanceTiles']>0 for v in clear)
 routes=[]
 for slot in inter['slots']:
  pts=slot.get('approach',[slot['position']]);nearest=float('inf')
  for p,q in zip(pts,pts[1:]):
   vx=q[0]-p[0];vy=q[1]-p[1];t=max(0,min(1,((x-p[0])*vx+(y-p[1])*vy)/(vx*vx+vy*vy)))
   nearest=min(nearest,math.hypot(x-p[0]-t*vx,y-p[1]-t*vy))
  routes.append({'slot':slot['id'],'centerDistanceTiles':nearest,'twoBodyClearanceTiles':nearest-2*radius})
 assert all(v['twoBodyClearanceTiles']>0 for v in routes)
 metrics[f]={'bodyRadiusAssumptionTiles':radius,'obstacleClearances':clear,'guestRouteClearances':routes,'feetSupport':r['feetSupport'],'headClearance':r['headClearance']}
assert len({a['uid'] for a in data.values()})==4
(P/'clearance.json').write_text(json.dumps(metrics,indent=2)+'\n')
print('PASS: 4 anchors, 16 unchanged images, 4 unchanged roots, 32 valid depth buffers, body and route clearance')
