"""Read immutable approved roots; export only new staff depth assets and evidence."""
import bpy, json, math, hashlib, struct
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
HERE=Path(__file__).resolve().parent
W=HERE.parents[5]; B=W/'assets/generated/kairo-v4-simple-pilot'
MAIN=Path('/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji')
A=MAIN/'public/assets/approved-facilities'
manifest=json.loads((A/'manifest.json').read_text())['facilities']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
anchors={'info':[0,.12,0],'indoor_shop':[0,-.08,0],'rental_tube':[-.57,.22,0],'watchtower':[0,-.05,1.01]}
allreport={}; data={}
for idx,(fid,pos) in enumerate(anchors.items()):
 rec=manifest[fid];src=B/rec['blueprint']/fid;runtime=src.parent/'runtime/assets'/fid
 c=json.loads((src/'review-contract.json').read_text());old=json.loads((runtime/'depth-metadata.json').read_text());inter=json.loads((src/'interaction.json').read_text())
 blend=src/c['blend'];before=sha(blend);assert before==old['sourceSHA']
 native={}
 for d in range(4):
  name=f'native-d{d}.png';h=sha(A/fid/name)
  assert h==sha(runtime/name)==rec['frames'][f'd{d}']['sha256']==old['directions'][d]['imageHashes']['native']
  native[name]=h
 bpy.ops.wm.open_mainfile(filepath=str(blend));scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2
 root=bpy.data.objects[c['root']];root.rotation_euler=(0,0,0);bpy.context.view_layer.update()
 T=c['tile_world'];N=c['logical_size'];cam=scene.camera;assert abs(cam.data.ortho_scale-N)<1e-5
 tagged=[o for o in scene.objects if o.type=='MESH' and o.get('cutaway_side')];assert not tagged
 bounds={}
 for o in scene.objects:
  if o.type!='MESH':continue
  vs=[o.matrix_world@Vector(v)/T for v in o.bound_box]
  bounds[o.name]={'min':[min(v[k] for v in vs) for k in range(3)],'max':[max(v[k] for v in vs) for k in range(3)]}
 C=cam.matrix_world.translation.copy();Q=cam.matrix_world.to_quaternion();R=Q@Vector((1,0,0));U=Q@Vector((0,1,0));F=Q@Vector((0,0,-1))
 support={n for n in bounds if n=='Foundation' or n.startswith('Platform_')}
 report={'id':fid,'sourceSHA':before,'sourceBlend':str(blend),'presentation':'Unchanged approved display geometry; no cutaway tags on this root','camera':{'C':list(C),'R':list(R),'U':list(U),'F':list(F)},'tileWorld':T,'native':N,'supportTopObjects':sorted(support),'directions':[],'nativeHashesBefore':native,'boundsTiles':bounds}
 deps=bpy.context.evaluated_depsgraph_get()
 p=Vector(pos)*T
 hit,P,normal,face,obj,_=scene.ray_cast(deps,p+Vector((0,0,.01*T)),Vector((0,0,-1)),distance=.1*T)
 report['feetSupport']={'hit':hit,'object':obj.name if hit else 'world terrain','z':P.z/T if hit else 0,'errorTiles':abs((P.z/T if hit else 0)-pos[2])}
 assert report['feetSupport']['errorTiles']<.001
 H=22/(math.cos(math.pi/6)*T)
 hit,P,normal,face,obj,_=scene.ray_cast(deps,p+Vector((0,0,.01*T)),Vector((0,0,1)),distance=4*T)
 report['headClearance']={'humanHeightTiles':H,'ceilingObject':obj.name if hit else None,'clearanceTiles':P.z/T-pos[2]-H if hit else None}
 assert not hit or report['headClearance']['clearanceTiles']>0
 for d in range(4):
  root.rotation_euler=(0,0,d*math.pi/2);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
  depth=[];supp=[];maxerr=0;hits=0;excluded=0
  for y in range(N):
   for x in range(N):
    O=C+R*(x+.5-N/2)+U*(N/2-y-.5)
    hit,P,normal,face,obj,_=scene.ray_cast(deps,O+F*cam.data.clip_start,F,distance=cam.data.clip_end)
    z=(P-C).dot(F) if hit else math.inf;depth.append(z);other=z
    if hit:
     hits+=1;uv=world_to_camera_view(scene,cam,P);maxerr=max(maxerr,abs(uv.x*N-x-.5),abs((1-uv.y)*N-y-.5))
     for attempt in range(12):
      if not hit or obj.name not in support or normal.z<.65:break
      excluded+=1;hit,P,normal,face,obj,_=scene.ray_cast(deps,P+F*.001,F,distance=cam.data.clip_end)
      other=(P-C).dot(F) if hit else math.inf
    supp.append(other)
  files={}
  for kind,values in [('depth',depth),('support',supp)]:
   name=f'staff-{kind}-d{d}.bin';target=A/fid/name;payload=struct.pack('<%df'%(N*N),*values)
   if target.exists():assert target.read_bytes()==payload,target
   else:target.write_bytes(payload)
   files[name]=sha(target)
  original=struct.unpack('<%df'%(N*N),(runtime/f'depth-d{d}.bin').read_bytes())
  error=max((abs(a-b) for a,b in zip(depth,original) if math.isfinite(a) and math.isfinite(b)),default=0)
  assert all(math.isfinite(a)==math.isfinite(b) for a,b in zip(depth,original)) and error<.001
  assert maxerr<.002
  report['directions'].append({'d':d,'hiddenWalls':[],'shownWalls':[],'imageHashes':{'native':native[f'native-d{d}.png']},'finitePixels':hits,'supportTopExclusions':excluded,'maxReprojectionError':maxerr,'authoritativeDepthMaxError':error,'files':files})
 assert sha(blend)==before
 assert all(sha(A/fid/n)==v for n,v in native.items())
 report['sourceAndNativeUnchanged']=True
 (A/fid/'staff-depth-metadata.json').write_text(json.dumps(report,indent=2))
 allreport[fid]=report
 data[fid]={'id':fid,'position':pos,'heading':-math.pi/2,'pose':'idle','uid':-110001-idx,'role':'lifeguard' if fid=='watchtower' else 'attendant','depthPrefix':'staff','sourceSHA':before}
 (HERE/'evidence.json').write_text(json.dumps(allreport,indent=2))
 (HERE/'anchors.json').write_text(json.dumps(data,indent=2))
 print('STAFF_DONE',fid,flush=True)
(MAIN/'src/data/facility-attendants.json').write_text(json.dumps(data,indent=2)+'\n')
