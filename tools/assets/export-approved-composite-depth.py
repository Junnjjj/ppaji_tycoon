"""Read-only Blender depth export for the approved full playground assembly."""
import bpy,math,struct,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
src,out=map(Path,sys.argv[sys.argv.index('--')+1:]);out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=sha(src);bpy.ops.wm.open_mainfile(filepath=str(src));scene=bpy.context.scene;cam=scene.camera;root=bpy.data.objects['AssemblyRoot'];n=640
assert abs(cam.data.ortho_scale-n)<.001
removed=[]
for o in list(scene.objects):
 if o.type=='MESH' and o.hide_render: removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.update();q=cam.matrix_world.to_quaternion();c=cam.matrix_world.translation.copy();r,u,f=[q@Vector(v) for v in [(1,0,0),(0,1,0),(0,0,-1)]]
target=Vector((0,0,.65*math.sqrt(512)));offset=(target-c).dot(f)-250
report={'source':str(src),'source_sha256':before,'size':n,'depth_normalization_offset':offset,'hidden_meshes_excluded':removed,'directions':[]}
for d in range(4):
 root.rotation_euler=(0,0,d*math.pi/2);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();values=[];error=0
 vertices=[];polygons=[]
 for ob in scene.objects:
  if ob.type!='MESH' or ob.hide_render:continue
  ev=ob.evaluated_get(deps);mesh=ev.to_mesh();base=len(vertices);matrix=ev.matrix_world
  vertices.extend(matrix@v.co for v in mesh.vertices);polygons.extend(tuple(base+i for i in poly.vertices) for poly in mesh.polygons);ev.to_mesh_clear()
 tree=BVHTree.FromPolygons(vertices,polygons,all_triangles=False)
 print('BVH',d,len(vertices),len(polygons),flush=True)
 for y in range(n):
  for x in range(n):
   origin=c+r*(x+.5-n/2)+u*(n/2-y-.5)
   p,normal,index,distance=tree.ray_cast(origin,f,2500)
   hit=p is not None
   values.append((p-c).dot(f)-offset if hit else math.inf)
   if hit and x%31==0 and y%31==0:
    uv=world_to_camera_view(scene,cam,p);error=max(error,abs(uv.x*n-x-.5),abs((1-uv.y)*n-y-.5))
 assert error<.002,error
 path=out/f'full-d{d}.bin';path.write_bytes(struct.pack(f'<{n*n}f',*values))
 report['directions'].append({'d':d,'sha256':sha(path),'hits':sum(math.isfinite(v) for v in values),'reprojection_error_px':error});print('EXPORTED',d,error,flush=True)
assert sha(src)==before
report['source_unchanged']=True;(out/'depth-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
