"""Shared painted building shader for authored Blender meshes. Import inside Blender.

factory = material_factory(root, atlas_image, recipe, tile_world)
material = factory(role, 'B', dimensions_in_tiles, curved=False)
Call assign_shared_uv(obj, role, recipe, tile_world) after applying mesh scale.
Atlas quadrants are material-only, not a building facade. No filesystem or provider side effects.
"""
import bpy
from mathutils import Vector

def srgb(h):
    values=[int(h[i:i+2],16)/255 for i in [1,3,5]]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)

def assign_shared_uv(obj, role, recipe, tile_world):
    quadrant=recipe.get('atlas_quadrants',{}).get(role)
    if quadrant is None:return
    if obj.type!='MESH':raise ValueError('Shared UV requires a mesh')
    period=recipe.get('period_tiles',3)
    if period<=0 or tile_world<=0:raise ValueError('Positive tile scale and texture period required')
    uv=obj.data.uv_layers.get('SharedMaterial') or obj.data.uv_layers.new(name='SharedMaterial')
    for face in obj.data.polygons:
        axes=[i for i in range(3) if i!=max(range(3),key=lambda i:abs(face.normal[i]))]
        for k in face.loop_indices:
            co=obj.matrix_local@obj.data.vertices[obj.data.loops[k].vertex_index].co
            v=[(co[i]/(tile_world*period)+.5)%1 for i in axes]
            uv.data[k].uv=((quadrant[0]+.025+.95*v[0])/2,(1-quadrant[1]+.025+.95*v[1])/2)

def material_factory(root, atlas_image, recipe, tile_world):
    if tile_world<=0:raise ValueError('Positive tile_world required')
    PAL=recipe['palettes'];QUAD={k:tuple(v) for k,v in recipe.get('atlas_quadrants',{}).items()}
    if any(len(v)!=4 for v in PAL.values()):raise ValueError('Every palette requires four light levels')
    T=tile_world;img=atlas_image;mats={};strengths=recipe.get('texture_strength',{});edge_widths=recipe.get('edge_width_tiles',{});gains=recipe.get('role_linear_gain',{})
    if QUAD and img is None:raise ValueError('An atlas is required for textured roles')
    means={}
    if img is not None:
        pix=tuple(img.pixels);iw,ih=img.size
        if not iw or not ih:raise ValueError('Atlas must contain pixels')
        for q in set(QUAD.values()):
            vals=[]
            for y in range(int((1-q[1])*.5*ih+.06*ih),int((2-q[1])*.5*ih-.06*ih),max(1,ih//30)):
                for x in range(int(q[0]*.5*iw+.06*iw),int((q[0]+1)*.5*iw-.06*iw),max(1,iw//30)):
                    cc=pix[(y*iw+x)*4:(y*iw+x)*4+3]
                    cc=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in cc]
                    vals.append(sum(v*k for v,k in zip(cc,[.2126,.7152,.0722])))
            means[q]=max(sum(vals)/len(vals),1e-6)
    def mat(role,mode,dims,curved):
            key=(role,mode,tuple(round(v,5) for v in dims),curved)
            if key in mats:return mats[key]
            m=bpy.data.materials.new(role+'_'+mode);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
            def node(t):return n.new(t)
            def calc(op,x,y=None):
                v=node('ShaderNodeMath');v.operation=op
                for i,z in enumerate([x] if y is None else [x,y]):
                    if isinstance(z,(int,float)):v.inputs[i].default_value=z
                    else:l.new(z,v.inputs[i])
                return v.outputs[0]
            def mix(op,f,x,y):
                v=node('ShaderNodeMixRGB');v.blend_type=op
                for socket,z in zip(v.inputs,[f,x,y]):
                    if isinstance(z,(int,float)):socket.default_value=z
                    elif isinstance(z,tuple):socket.default_value=(*z,1) if len(z)==3 else z
                    else:l.new(z,socket)
                return v.outputs[0]
            g=node('ShaderNodeNewGeometry');dot=node('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.4,-.7,.8)).normalized();l.new(g.outputs['Normal'],dot.inputs[0]);light=calc('ADD',.5,calc('MULTIPLY',dot.outputs['Value'],.5))
            r=node('ShaderNodeValToRGB');r.color_ramp.interpolation='CONSTANT' if mode=='B' else 'LINEAR';r.color_ramp.elements.remove(r.color_ramp.elements[1])
            for i,(pos,col) in enumerate(zip([0,.24,.6,.89],PAL[role])):
                e=r.color_ramp.elements[0] if i==0 else r.color_ramp.elements.new(pos);e.position=pos;e.color=(*srgb(col),1)
            l.new(light,r.inputs[0]);color=r.outputs['Color'];color=mix('MULTIPLY',1.0,color,(float(gains.get(role,1.0)),)*3);tc=node('ShaderNodeTexCoord');tc.object=root
            if mode=='B' and role in QUAD:
                q=QUAD[role];v=node('ShaderNodeVectorMath');v.operation='SCALE';v.inputs['Scale'].default_value=1/(T*3);l.new(tc.outputs['Object'],v.inputs[0])
                frac=node('ShaderNodeVectorMath');frac.operation='FRACTION';l.new(v.outputs[0],frac.inputs[0])
                tex=node('ShaderNodeTexImage');tex.image=img;tex.interpolation='Closest';tex.projection='BOX';tex.projection_blend=.15
                # BOX uses different coordinate pairs; a shared UV layer pins the desired quadrant on each face.
                uv=node('ShaderNodeUVMap');uv.uv_map='SharedMaterial';l.new(uv.outputs[0],tex.inputs['Vector']);tex.projection='FLAT'
                bw=node('ShaderNodeRGBToBW');l.new(tex.outputs['Color'],bw.inputs[0]);v=calc('MAXIMUM',.5,calc('MINIMUM',1.5,calc('DIVIDE',bw.outputs[0],means[q])))
                color=mix('MULTIPLY',strengths.get(role, .42),color,v)
            if mode=='B':
                if curved:
                    facing=node('ShaderNodeVectorMath');facing.operation='DOT_PRODUCT';l.new(g.outputs['Normal'],facing.inputs[0]);l.new(g.outputs['Incoming'],facing.inputs[1]);edge=calc('ABSOLUTE',facing.outputs['Value']);width=.075
                else:
                    xyz=node('ShaderNodeSeparateXYZ');l.new(tc.outputs['Generated'],xyz.inputs[0]);ds=[]
                    for i,v in enumerate(xyz.outputs):ds.append(calc('MULTIPLY',calc('MINIMUM',v,calc('SUBTRACT',1,v)),dims[i]))
                    edge=calc('MINIMUM',calc('MAXIMUM',ds[0],ds[1]),calc('MINIMUM',calc('MAXIMUM',ds[1],ds[2]),calc('MAXIMUM',ds[2],ds[0])));width=edge_widths.get(role,.017)
                ink=calc('LESS_THAN',edge,width);color=mix('MIX',ink,color,srgb('#111714'))
                band=calc('MULTIPLY',calc('GREATER_THAN',edge,width),calc('LESS_THAN',edge,width*2.5));band=calc('MULTIPLY',band,calc('MULTIPLY',light,.45));color=mix('MIX',band,color,srgb(PAL[role][-1]))
            ao=node('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.12*T;ao.samples=12;signal=ao.outputs['AO']
            if mode=='B':signal=calc('DIVIDE',calc('FLOOR',calc('MULTIPLY',signal,3.999)),3)
            color=mix('MULTIPLY',.85,color,calc('ADD',.22,calc('MULTIPLY',signal,.78)))
            em=node('ShaderNodeEmission');l.new(color,em.inputs[0]);o=node('ShaderNodeOutputMaterial');l.new(em.outputs[0],o.inputs[0]);mats[key]=m;return m
    return mat

def prepare_authored_mesh(obj):
    """Recalculate closed-mesh winding before material assignment; no scene-wide operators."""
    import bmesh
    if obj.type != 'MESH':
        raise ValueError('Expected a mesh')
    bm=bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        obj.data.update()
    finally:
        bm.free()


def configure_painted_render(scene, profile='color', logical_size=192, density=4):
    """Configure deterministic B preview output; camera/geometry/world scale remain caller-owned."""
    if profile not in ('color','native'):
        raise ValueError('profile must be color or native')
    if logical_size<=0 or density<1:
        raise ValueError('Positive logical canvas and density required')
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.cycles.filter_width=.01 if profile=='native' else 1.5
    scene.render.film_transparent=True
    scene.render.dither_intensity=0
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_percentage=100
    scene.render.resolution_x=scene.render.resolution_y=logical_size*(1 if profile=='native' else density)
    scene.view_settings.view_transform='Standard'
    scene.view_settings.look='None'
    scene.view_settings.exposure=0
    scene.view_settings.gamma=1
