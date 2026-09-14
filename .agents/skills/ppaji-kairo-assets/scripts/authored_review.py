#!/usr/bin/env python3
"""Deterministic authored facility review. See references/authored-review-runner.md."""
import argparse, hashlib, importlib.util, json, math, os, subprocess, sys
from pathlib import Path
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent

def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def calibrate(contract, dest):
    import bpy
    from mathutils import Vector
    c=json.loads(Path(contract).read_text()); dest=Path(dest)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    bpy.ops.mesh.primitive_cube_add(size=32,location=(0,0,16))
    mat=bpy.data.materials.new('Calibration');mat.diffuse_color=(.5,.65,.8,1)
    bpy.context.object.data.materials.append(mat)
    bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam
    cam.rotation_euler=(math.pi/3,0,math.pi/4)
    cam.location=Vector((.612372435696,-.612372435696,.5))*220+Vector((0,0,c['camera_target_z_tiles']*c['tile_world']))
    cam.data.type='ORTHO';cam.data.ortho_scale=c['ortho_scale']
    scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=False;
    world=bpy.data.worlds.new('CalibrationWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.8,.8,.8,1);scene.world=world;
    scene.render.resolution_x=scene.render.resolution_y=192;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    for name,x in [('positive',60),('negative',45)]:
        cam.rotation_euler.x=math.radians(x);scene.render.filepath=str(dest/(name+'.png'));bpy.ops.render.render(write_still=True)

def blender_pass(contract, dest, pilot=False):
    import bpy
    from mathutils import Vector
    from bpy_extras.object_utils import world_to_camera_view
    c = json.loads(Path(contract).read_text()); dest = Path(dest)
    bpy.ops.wm.open_mainfile(filepath=c['blend'])
    scene = bpy.context.scene; root = bpy.data.objects[c['root']]; cam = scene.camera
    t = c['tile_world']; size = c.get('logical_size',192); density = c.get('density',4)
    assert root.rotation_mode=='XYZ' and cam.parent is None, 'fixed camera/root representation'
    assert cam and cam.data.type == 'ORTHO', 'orthographic camera required'
    assert cam.rotation_mode == 'XYZ' and all(abs(a-math.radians(b))<1e-6 for a,b in zip(cam.rotation_euler,(60,0,45))), 'camera rotation'
    assert abs(cam.data.ortho_scale-c['ortho_scale'])<1e-6, 'camera scale'
    assert all(abs(a-b)<1e-6 for a,b in zip(root.scale,(1,1,1))), 'root scale'
    assert root.parent is None and root.location.length<1e-6, 'root must be at origin'
    target=Vector((0,0,c['camera_target_z_tiles']*t)); delta=cam.location-target
    unit=Vector((.612372435696,-.612372435696,.5))
    assert delta.dot(unit)>0 and delta.cross(unit).length<1e-4, 'camera target'
    meshes=[o for o in scene.objects if o.type=='MESH']
    def owned(o):
        while o.parent:
            o=o.parent
            if o==root:return True
        return False
    assert meshes and all(owned(o) for o in meshes), 'mesh outside complete root'
    assert not scene.animation_data and not any(o.animation_data or o.constraints for o in scene.objects), 'animated/constrained review unsupported'
    # File-backed textures must survive reopening on another machine.
    textures=[im for im in bpy.data.images if im.source=='FILE' and im.users>0]
    assert all(im.packed_file for im in textures), 'unpacked file texture'
    root.rotation_euler=(0,0,0); bpy.context.view_layer.update()
    def selected(selector):
        if 'names' in selector:
            names=selector['names']; found=[o for o in meshes if o.name in names]
            assert len(found)==len(names), 'missing named object'
            return found
        assert selector['prefix'], 'empty selector prefix'
        return [o for o in meshes if o.name.startswith(selector['prefix'])]
    counts={}
    for key,s in c['inventory'].items():
        counts[key]=len(selected(s)); assert counts[key]==s['count'], 'inventory '+key
    bounds={}
    for key,s in c['groups'].items():
        objects=selected(s); assert objects, 'empty bounds group '+key
        pts=[root.matrix_world.inverted()@o.matrix_world@Vector(v)/t for o in objects for v in o.bound_box]
        bounds[key]=[[min(p[a] for p in pts) for a in range(3)],[max(p[a] for p in pts) for a in range(3)]]
    if c['floor_mode']=='full-footprint-integral':
        lo,hi=bounds['floor']
        for axis,extent in enumerate(c['size']):
            assert abs(lo[axis]+extent/2)<1e-5 and abs(hi[axis]-extent/2)<1e-5, 'floor footprint'
    else: assert c['floor_mode']=='transparent-no-floor', 'floor mode'
    spec=importlib.util.spec_from_file_location('painted',HERE/'painted_building_materials.py'); mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    landmarks={}; rotations=[]
    for d in ([0] if pilot else range(4)):
        root.rotation_euler=(0,0,d*math.pi/2); bpy.context.view_layer.update()
        landmarks[f'd{d}']={}
        for name,point in c.get('landmarks',{}).items():
            v=world_to_camera_view(scene,cam,root.matrix_world@Vector(point)*t)
            landmarks[f'd{d}'][name]={'pixel':[v.x*size*density,(1-v.y)*size*density],'visibility':'inspect rendered occlusion'}
        rotations.append({'direction':d,'yaw_deg':d*90,'matrix_world':[list(row) for row in root.matrix_world]})
        for profile in ('color','native'):
            mod.configure_painted_render(scene,profile,logical_size=size,density=density)
            scene.render.filepath=str(dest/f'{profile}-d{d}.png');bpy.ops.render.render(write_still=True)
    write(dest/'scene-check.json',{'complete_root':True,'camera_exact':True,'mesh_count':len(meshes),'inventory':counts,'bounds_tiles':bounds,'camera_matrix':[list(row) for row in cam.matrix_world],'rotations':rotations,'packed_textures':[im.name for im in textures]})
    write(dest/'landmark-correspondence.json',landmarks)

def run_child(command, log, env):
    with Path(log).open('w') as f:
        result=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,env=env)
    if result.returncode: raise RuntimeError('command failed; see '+str(log))

def metrics(a,b=None):
    from PIL import Image, ImageChops
    im=Image.open(a).convert('RGBA');alpha=im.getchannel('A');box=alpha.getbbox()
    assert box, 'empty image '+str(a)
    edge=box[0]==0 or box[1]==0 or box[2]==im.width or box[3]==im.height
    equal=None
    if b:
        other=Image.open(b).convert('RGBA')
        equal=im.size==other.size and im.tobytes()==other.tobytes()
    return {'size':list(im.size),'bbox':list(box),'foreground_pixels':sum(alpha.histogram()[1:]),'clipped':edge,'rgba_equal':equal,'sha256':sha(a)}

def review_page(out, concept, size):
    import shutil
    from PIL import Image
    shutil.copy2(concept,out/'concept.png')
    # Full, common canvas. No asset-specific crop or scaling.
    html='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>시설 독립 제작 비교</title><style>body{font:16px system-ui;margin:24px;background:#f4f1e8;color:#28352e}button,select{font:inherit;margin:5px;padding:8px}section{display:flex;flex-wrap:wrap;gap:16px}.card{background:#e0e5d9;padding:12px;flex:1;min-width:260px;overflow:auto}canvas{image-rendering:pixelated}img{width:100%;height:384px;object-fit:contain}p{max-width:900px}</style><h1>컨셉과 독립 제작 후보</h1><p>컨셉은 미술 참고이며 배율이 다릅니다. 네 방향은 같은 카메라와 배율입니다. 미술·게임 적용 검토 대기.</p><div id="controls"></div><label><input type="checkbox" id="hd">고해상도</label><select id="zoom"><option value="1">실제 크기</option><option value="2" selected>2배</option><option value="3">3배</option></select><section><div class="card"><h2>컨셉</h2><img src="concept.png"></div><div class="card"><h2>새 후보</h2><canvas id="asset"></canvas></div></section><p id="status"></p><script>let dir=0;window.reviewErrors=[];async function draw(){try{const p=document.querySelector('#hd').checked?'color':'native';const im=new Image();im.src=p+'-d'+dir+'.png';await im.decode();const c=document.querySelector('#asset'),z=+document.querySelector('#zoom').value;c.width=c.height=SIZE*z;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(im,0,0,c.width,c.height);c.dataset.direction=dir;c.dataset.profile=p;document.querySelector('#status').textContent='표시 완료 · '+dir*90+'°'}catch(e){reviewErrors.push(String(e))}}for(let d=0;d<4;d++){const b=document.createElement('button');b.textContent=d*90+'°';b.onclick=()=>{dir=d;draw()};document.querySelector('#controls').append(b)}document.querySelector('#hd').onchange=draw;document.querySelector('#zoom').onchange=draw;draw();</script>'''
    (out/'review.html').write_text(html.replace('SIZE',str(size)),encoding='utf-8')
    board=Image.new('RGBA',(size*4,size),(224,229,217,255))
    for d in range(4):board.alpha_composite(Image.open(out/f'native-d{d}.png').convert('RGBA'),(d*size,0))
    board.save(out/'native-four-directions.png')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--contract',required=True,type=Path);p.add_argument('--out',required=True,type=Path)
    p.add_argument('--calibrate',action='store_true');p.add_argument('--blender',default='blender');p.add_argument('--pilot',action='store_true');p.add_argument('--inside',action='store_true')
    a=p.parse_args();out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
    if a.inside:return calibrate(a.contract,out) if a.calibrate else blender_pass(a.contract,out,a.pilot)
    c=json.loads(a.contract.read_text());base=a.contract.resolve().parent
    for key in (() if a.calibrate else ('blend','concept')):
        c[key]=str((base/c[key]).resolve());assert Path(c[key]).is_file(),key
    assert not (out/'summary.json').exists(), 'use a fresh output directory'
    write(out/'contract.resolved.json',c);protected={key:sha(c[key]) for key in (() if a.calibrate else ('blend','concept'))}
    env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1',TMPDIR=str(out/'tmp'));(out/'tmp').mkdir(exist_ok=True)
    cmd=[a.blender,'--background','--python-exit-code','1','--python',str(Path(__file__).resolve()),'--','--inside','--contract',str(out/'contract.resolved.json')]
    if a.calibrate:
        run_child(cmd+['--out',str(out),'--calibrate'],out/'calibration.log',env)
        results={}
        for name in ('positive','negative'):
            r=subprocess.run([sys.executable,str(HERE/'qa_projection.py'),'--layout','single',str(out/(name+'.png'))],capture_output=True,text=True,env=env)
            assert r.returncode==0,r.stderr;results[name]=json.loads(r.stdout)
        write(out/'calibration.json',results)
        assert results['positive']['overall']=='PASS' and results['negative']['overall']=='FAIL','calibration failed'
        print(json.dumps({'calibration':'PASS','output':str(out)}));return
    run_child(cmd+['--out',str(out)]+(['--pilot'] if a.pilot else []),out/'render.log',env)
    if a.pilot:
        m={p:metrics(out/f'{p}-d0.png') for p in ('color','native')};write(out/'pilot.json',m);print(json.dumps({'pilot':str(out),'clipped':any(v['clipped'] for v in m.values())}));return
    reopen=out/'reopen';reopen.mkdir()
    run_child(cmd+['--out',str(reopen)],out/'reopen.log',env)
    m={f'{p}-d{d}':metrics(out/f'{p}-d{d}.png',reopen/f'{p}-d{d}.png') for d in range(4) for p in ('color','native')}
    write(out/'rgba-reproducibility.json',m)
    for name,v in m.items():
        expected=c.get('logical_size',192)*(c.get('density',4) if name.startswith('color') else 1)
        assert v['size']==[expected,expected], 'render size'
    assert all(v['rgba_equal'] and not v['clipped'] for v in m.values()), 'RGBA/clipping failed'
    assert all(m[f'native-d{d}']['foreground_pixels']>=c['minimum_native_foreground'] for d in range(4)), 'native visible mass'
    assert json.loads((out/'scene-check.json').read_text())==json.loads((reopen/'scene-check.json').read_text()), 'scene mismatch'
    proj={}
    for d in range(4):
        r=subprocess.run([sys.executable,str(HERE/'qa_projection.py'),'--layout','single',str(out/f'color-d{d}.png')],capture_output=True,text=True,env=env);assert r.returncode==0,r.stderr;proj[f'd{d}']=json.loads(r.stdout)
    write(out/'projection-validation.json',proj)
    assert all(sha(c[k])==v for k,v in protected.items()),'source modified'
    review_page(out,c['concept'],c.get('logical_size',192))
    result={'status':'TECHNICAL_CHECKS_PASS_ART_USER_REVIEW','rgba_equal_images':8,'clipping':0,'protected':protected,'projection':{k:v['overall'] for k,v in proj.items()},'scene':str(out/'scene-check.json'),'review':str(out/'review.html'),'limitations':['Bounds selectors and count labels require semantic visual review','Landmark projections do not prove occlusion','Runtime, access, family scale and artist approval remain separate']}
    write(out/'summary.json',result);print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':
    if '--' in sys.argv:sys.argv=[sys.argv[0]]+sys.argv[sys.argv.index('--')+1:]
    main()
