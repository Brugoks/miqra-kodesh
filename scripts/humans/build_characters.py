"""Build game-ready humans from CC0 MakeHuman anatomy and fitted clothing.
Run with Blender --background --python this_file -- --source /tmp/miqra-human-assets --mpfb /tmp/miqra-mpfb.
Source provenance is recorded in docs/scene-humans-assets.md. No runtime dependency on Blender/MPFB.
"""
import argparse,sys,math,json,hashlib
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion
parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True);parser.add_argument('--mpfb',required=True)
parser.add_argument('--only',default='');parser.add_argument('--preview',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
REPO=Path(__file__).resolve().parents[2]; OUT=REPO/'public/assets/scenes/shared/humans'; CACHE=REPO/'scripts/.cache/humans'
OUT.mkdir(parents=True,exist_ok=True); CACHE.mkdir(parents=True,exist_ok=True)
# Source checkout loaded for this background process only, without installing a user extension.
original_extension_path=bpy.utils.extension_path_user
bpy.utils.extension_path_user=lambda package,path='',create=False: str(CACHE/'mpfb'/path) if package=='mpfb' else original_extension_path(package,path=path,create=create)
sys.path.insert(0,str(Path(args.mpfb)/'src'));bpy.ops.preferences.addon_enable(module='mpfb')
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
SRC=Path(args.source)
CONFIGS=[
 dict(id='jesus',gender=1.0,age=.43,muscle=.45,weight=.44,skin='young_caucasian_male',hair='long01',color=(.90,.84,.70,1),height=.52),
 dict(id='artisan',gender=1.0,age=.58,muscle=.57,weight=.48,skin='middleage_caucasian_male',hair='short02',color=(.36,.29,.19,1),height=.52),
 dict(id='villager',gender=0.0,age=.43,muscle=.42,weight=.49,skin='young_caucasian_female',hair='long01',color=(.24,.30,.32,1),height=.43),
 dict(id='traveler',gender=1.0,age=.37,muscle=.64,weight=.48,skin='young_caucasian_male',hair='short04',color=(.49,.39,.25,1),height=.58),
 # Matthew sits at a table for a living and can afford dyed cloth, so he is
 # deliberately the one man in the cast who is none of: tall, lean, bearded,
 # or dressed in undyed wool. Silhouette does the work at scene distance.
 dict(id='matthew',gender=1.0,age=.52,muscle=.36,weight=.62,skin='middleage_caucasian_male',hair='short03',color=(.35,.22,.42,1),height=.44),
]

def material(name,path=None,color=(1,1,1,1),roughness=.8,alpha=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_fake_user=True
 n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=color;p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=0
 if path:
  tex=n.new('ShaderNodeTexImage');im=bpy.data.images.load(str(path),check_existing=True)
  limit=2048 if name=='Skin' else 1024
  if max(im.size)>limit: im.scale(limit,limit)
  if name in ('Skin','Hair','Beard'):
   import numpy as np
   im=im.copy();pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4))
   pixels[:,:3]*=np.array((.79,.66,.53) if name=='Skin' else (.30,.24,.18))
   im.pixels.foreach_set(pixels.ravel())
  im.filepath_raw=str(CACHE/(Path(path).stem+('-tint.png' if alpha else '-tint.jpg')))
  im.file_format='PNG' if alpha else 'JPEG';im.save()
  tex.image=im;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
  if alpha:m.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
 if name in ('Hair','Beard') and path:
  normalpath=Path(path).parent/('short02_normal.png' if name=='Hair' else 'Material_Diffuse_Color1_hn.png')
  if normalpath.exists():
   normal=n.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(normalpath),check_existing=True);normal.image.colorspace_settings.name='Non-Color'
   if max(normal.image.size)>1024:normal.image.scale(1024,1024)
   normalmap=n.new('ShaderNodeNormalMap');normalmap.inputs['Strength'].default_value=.45
   m.node_tree.links.new(normal.outputs['Color'],normalmap.inputs['Color']);m.node_tree.links.new(normalmap.outputs['Normal'],p.inputs['Normal'])
 m.diffuse_color=color
 if alpha:m.surface_render_method='DITHERED'
 return m

def texture_from_mhmat(path):
 for line in path.read_text().splitlines():
  if line.startswith('diffuseTexture '):return path.parent/line.split(' ',1)[1].strip()
 return None

def fit(h,path,kind,mat):
 o=HumanService.add_mhclo_asset(str(path),h,asset_type=kind,subdiv_levels=0,material_type='NONE')
 o.data.materials.clear();o.data.materials.append(mat)
 for poly in o.data.polygons:poly.use_smooth=True
 return o

def freeze_shapes(obj):
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 if obj.data.shape_keys:bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
 obj.select_set(False)

def set_world_rotation(bone,angles):
 from mathutils import Euler
 rest=bone.bone.matrix_local.to_quaternion();q=Euler(angles,'XYZ').to_quaternion()
 bone.rotation_mode='QUATERNION';bone.rotation_quaternion=rest.inverted()@q@rest

def add_clips(rig):
 # Small authored skeletal cycles. Source rig stays anatomical; no scaling of limbs/robes.
 rig.animation_data_create();fps=30;bpy.context.scene.render.fps=fps
 for name,duration in [('idle',4),('walk',1.2),('work',3),('prayer',4),('sit',4),('kneel',4)]:
  rig.animation_data.action=None
  for frame in range(int(duration*fps)+1):
   t=frame/(duration*fps);wave=math.sin(t*math.tau)
   for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion();b.location=Vector()
   for side,sign in [('Left',1),('Right',-1)]:
    arm=rig.pose.bones.get('mixamorig:'+side+'Arm');fore=rig.pose.bones.get('mixamorig:'+side+'ForeArm')
    angle=sign*math.radians(47)
    swing=wave*.24*sign if name=='walk' else math.sin(t*math.tau+sign)*.015
    if name=='work':swing=-.35+wave*.08;angle=sign*.52
    if name=='prayer':swing=-.75;angle=sign*.42
    if name in ('sit','kneel'):swing=-.45;angle=sign*.73
    set_world_rotation(arm,(swing,angle,0))
    set_world_rotation(fore,(-.15 if name=='idle' else -.32,0,0))
    if name=='walk':
     set_world_rotation(rig.pose.bones['mixamorig:'+side+'UpLeg'],(wave*.30*sign,0,0))
     set_world_rotation(rig.pose.bones['mixamorig:'+side+'Leg'],(max(0,-wave*sign)*.45,0,0))
    if name in ('sit','kneel'):
     set_world_rotation(rig.pose.bones['mixamorig:'+side+'UpLeg'],(-1.45 if name=='sit' else -.25,0,0))
     set_world_rotation(rig.pose.bones['mixamorig:'+side+'Leg'],(1.55 if name=='sit' else 2.1,0,0))
   hips=rig.pose.bones['mixamorig:Hips']
   if name in ('sit','kneel'):hips.location=hips.bone.matrix_local.to_quaternion().inverted()@Vector((0,0,-.39 if name=='sit' else -.49))
   hips.keyframe_insert(data_path='location',frame=frame)
   set_world_rotation(rig.pose.bones['mixamorig:Spine2'],(.012*wave+(.10 if name=='work' else 0),0,.008*wave))
   set_world_rotation(rig.pose.bones['mixamorig:Head'],(0,.018*wave,.012*wave))
   for b in rig.pose.bones:b.keyframe_insert(data_path='rotation_quaternion',frame=frame)
  action=rig.animation_data.action;action.name=name
  track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action)
  rig.animation_data.action=None
 for track in rig.animation_data.nla_tracks:track.mute=True
 # Use an ordinary relaxed pose in the default scene and exported rest evaluation.
 for side,sign in [('Left',1),('Right',-1)]:set_world_rotation(rig.pose.bones['mixamorig:'+side+'Arm'],(0,sign*math.radians(47),0))

def waist_radii(tunic,z0,z1,sectors=48,floor=.10):
 """The fitted garment's own silhouette at a height band, one radius per sector.
 Measured rather than assumed: the belt has to sit on this body, and Matthew's
 macro sliders make a wider one than any other character in the cast."""
 radii=[0.0]*sectors
 for v in tunic.data.vertices:
  if z0<=v.co.z<=z1:
   i=int(math.atan2(v.co.y,v.co.x)%math.tau/math.tau*sectors)%sectors
   radii[i]=max(radii[i],math.hypot(v.co.x,v.co.y))
 present=[r for r in radii if r>0] or [floor]
 mean=sum(present)/len(present)
 radii=[r if r>0 else mean for r in radii]
 # One pass of circular smoothing: a per-sector maximum is a noisy silhouette,
 # and a belt does not follow every wrinkle of the cloth under it.
 return [max(floor,(radii[i-1]+2*radii[i]+radii[(i+1)%sectors])/4) for i in range(sectors)]

def add_belt_and_purse(rig,tunic,conf):
 """A leather girdle with a money purse hung at the right hip.
 The purse is the whole point of the character, so it is real geometry on the
 rig rather than a painted stripe: it swings with the hips and reads at a
 distance, which a texture would not. Heights come off the rig's own pelvis so
 the belt sits on the hip bone whatever the height slider did to this body."""
 sectors=48;hip=rig.data.bones['mixamorig:Hips'].head_local.z
 beltTop=hip+.045;beltBottom=hip-.035
 waist=waist_radii(tunic,beltBottom-.02,beltTop+.02,sectors)
 skirt=waist_radii(tunic,beltBottom-.16,beltBottom-.01,sectors)
 verts=[];faces=[]
 def ring(points,close=True,previous=None):
  """Append one loop of vertices and bridge it to the loop before it."""
  base=len(verts);verts.extend(points);count=len(points)
  if previous is not None:
   for i in range(count if close else count-1):
    j=(i+1)%count
    faces.append((previous+i,previous+j,base+j,base+i))
  return base
 # --- the girdle: a narrow band hugging the hip, rounded in section --------
 previous=None
 for z,out in [(beltTop,.007),(hip+.018,.016),(hip-.010,.016),(beltBottom,.007)]:
  previous=ring([(math.cos(i/sectors*math.tau)*(waist[i]+out),
                  math.sin(i/sectors*math.tau)*(waist[i]+out),z) for i in range(sectors)],previous=previous)
 # --- the purse: hung on the character's right, a little forward ----------
 # Forward is -Y in this model space (the glTF export turns it into +Z) and the
 # character's right is -X, so this hangs where a seated man's own hand falls.
 direction=Vector((-.92,.39,0)).normalized()
 sector=int(math.atan2(direction.y,direction.x)%math.tau/math.tau*sectors)%sectors
 anchor=direction*(max(waist[sector],skirt[sector])+.034)
 side=Vector((-direction.y,direction.x,0))
 def pouch(z,r):
  # Flattened against the hip rather than a free-hanging ball.
  return [tuple(anchor+side*(math.cos(a)*r)+direction*(math.sin(a)*r*.72)+Vector((0,0,z-anchor.z)))
          for a in (i/16*math.tau for i in range(16))]
 previous=None
 for z,r in [(beltBottom+.004,.015),(hip-.070,.024),(hip-.108,.046),(hip-.160,.054),(hip-.212,.046),(hip-.248,.026),(hip-.260,.008)]:
  previous=ring(pouch(z,r),previous=previous)
 mesh=bpy.data.meshes.new('Girdle');mesh.from_pydata(verts,[],faces);mesh.update()
 for poly in mesh.polygons:poly.use_smooth=True
 belt=bpy.data.objects.new('Girdle',mesh);bpy.context.collection.objects.link(belt)
 # Cylindrical UVs, taken straight off the vertex positions. The grain below
 # is uniform noise, so the seam a projection like this leaves is invisible,
 # and every shipped part of a character has to be genuinely textured.
 uv=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  for li in poly.loop_indices:
   co=mesh.vertices[mesh.loops[li].vertex_index].co
   uv.data[li].uv=((math.atan2(co.y,co.x)/math.tau)%1.0*3,co.z*7)
 texpath=CACHE/'matthew-leather.png'
 image=bpy.data.images.new('Oiled leather',width=64,height=64)
 pixels=[]
 for yy in range(64):
  for xx in range(64):
   # Coarse hide grain: a stable pseudo-random mottle plus a finer crease.
   grain=(math.sin(xx*2.3+yy*1.7)*.5+math.sin(xx*.7-yy*3.1)*.5)*.055+math.sin((xx+yy)*11.)*.018
   pixels.extend((max(0,.34+grain),max(0,.21+grain*.8),max(0,.13+grain*.6),1))
 image.pixels[:]=pixels;image.filepath_raw=str(texpath);image.file_format='PNG';image.save()
 belt.data.materials.append(material('Girdle',texpath,color=(.72,.72,.72,1),roughness=.58))
 groups=[belt.vertex_groups.new(name='mixamorig:'+name) for name in ['Hips','Spine']]
 for v in mesh.vertices:
  # Everything here rides the pelvis; the top edge picks up a little of the
  # lower spine so the band does not crease when he leans over a table.
  upper=max(0,min(1,(v.co.z-hip)/.06))
  for group,w in zip(groups,[1-upper,upper]):
   if w:group.add([v.index],w,'REPLACE')
 belt.parent=rig;mod=belt.modifiers.new('Armature','ARMATURE');mod.object=rig
 solid=belt.modifiers.new('Leather thickness','SOLIDIFY');solid.thickness=.006
 bpy.context.view_layer.objects.active=belt;bpy.ops.object.modifier_apply(modifier=solid.name)

def build(conf):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 macro=TargetService.get_default_macro_info_dict()
 for key in ['gender','age','muscle','weight','height']:macro[key]=conf[key]
 macro['race']={'caucasian':.70,'african':.20,'asian':.10}
 h=HumanService.create_human(macro_detail_dict=macro);h.name='Skin'
 # Add subtle distinct facial proportions using authored MakeHuman morph targets.
 targets=Path(args.mpfb)/'src/mpfb/data/targets'
 for rel,weight in [('nose/nose-volume-incr.target.gz',.18 if conf['gender'] else .06),('chin/chin-width-incr.target.gz',.12 if conf['gender'] else .02)]:
  if (targets/rel).exists():TargetService.load_target(h,str(targets/rel),weight=weight)
 rig=HumanService.add_builtin_rig(h,'mixamo');rig.name='HumanRig'
 skinfolder=SRC/'system/skins'/conf['skin'];skinpath=texture_from_mhmat(skinfolder/(conf['skin']+'.mhmat'))
 h.data.materials.clear();h.data.materials.append(material('Skin',skinpath,roughness=.67))
 for poly in h.data.polygons:poly.use_smooth=True
 eye=fit(h,SRC/'system/eyes/low-poly/low-poly.mhclo','Eyes',material('Eyes',texture_from_mhmat(SRC/'system/eyes/materials/brown.mhmat'),roughness=.18))
 hairpath=SRC/'system/hair'/conf['hair']
 hair=fit(h,hairpath/(conf['hair']+'.mhclo'),'Hair',material('Hair',texture_from_mhmat(hairpath/(conf['hair']+'.mhmat')),roughness=.85,alpha=True))
 if conf['id'] in ('artisan','jesus'):
  beardpath=SRC/'beards/clothes/grinsegold_beard_sigmund_wip'
  fit(h,beardpath/'grinsegold_beard_sigmund_wip.mhclo','Clothes',material('Beard',texture_from_mhmat(next(beardpath.glob('*.mhmat'))),roughness=.9,alpha=True))
 browpath=SRC/'system/eyebrows/eyebrow001'
 fit(h,browpath/'eyebrow001.mhclo','Eyebrows',material('Brows',texture_from_mhmat(browpath/'eyebrow001.mhmat'),roughness=.9,alpha=True))
 tunicpath=SRC/'dress/clothes/wdg_mycenaean_tunic'
 tunic=fit(h,tunicpath/'wdg_mycenaean_tunic.mhclo','Clothes',material('Cloth',texture_from_mhmat(tunicpath/'mycenaean_tunic.mhmat'),roughness=.94))
 # Color multiplier stays in the shader graph; bake image tint so glTF retains it.
 cm=tunic.data.materials[0];tex=next(n for n in cm.node_tree.nodes if n.type=='TEX_IMAGE');im=tex.image.copy()
 import numpy as np
 pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape((-1,4));pixels[:,:3]*=np.array(conf['color'][:3])
 im.pixels.foreach_set(pixels.ravel());im.filepath_raw=str(CACHE/(conf['id']+'-cloth.jpg'));im.file_format='JPEG';im.save();tex.image=im
 if conf['gender']==0 or conf['id'] in ('jesus','matthew'):
  # Lengthen the plain short-sleeved tunic into a modest household garment.
  for v in tunic.data.vertices:
   if v.co.z<.90:
    v.co.z=.90+(v.co.z-.90)*1.65;v.co.x*=1.22;v.co.y*=1.22
 if conf['id']=='matthew':add_belt_and_purse(rig,tunic,conf)
 if conf['id']=='jesus':
  # A woven mantle over the left shoulder, with folds and a back panel.
  # Conventional visual identity for the tableau, not a historical portrait.
  verts=[];faces=[];uvs=[]
  paths=[[(.16,-.07,1.43),(.15,-.20,1.34),(.06,-.235,1.17),(-.09,-.23,.98),(-.15,-.225,.75),(-.12,-.22,.45)],
         [(.16,.07,1.43),(.14,.20,1.29),(.04,.23,1.08),(-.08,.24,.85),(-.13,.24,.61),(-.12,.22,.44)]]
  for panel,path in enumerate(paths):
   start=len(verts);rows=31;cols=9
   for row in range(rows):
    t=row/(rows-1)*(len(path)-1);k=min(int(t),len(path)-2);f=t-k
    center=Vector(path[k]).lerp(Vector(path[k+1]),f)
    for col in range(cols):
     u=col/(cols-1);width=.18+.20*min(1,row/14)
     v=center+Vector(((u-.5)*width,(-1 if panel==0 else 1)*(.012*math.cos(u*math.tau*3)+.006*math.sin(row*.7)),.012*math.sin(u*math.tau)))
     verts.append(tuple(v));uvs.append((u,row/(rows-1)))
     if row<rows-1 and col<cols-1:
      a=start+row*cols+col;faces.append((a,a+1,a+cols+1,a+cols))
  # Connect both draped panels across the shoulder.
  for col in range(8):faces.append((col,279+col,280+col,col+1))
  mesh=bpy.data.meshes.new('Mantle');mesh.from_pydata(verts,[],faces);mesh.update()
  mantle=bpy.data.objects.new('Mantle',mesh);bpy.context.collection.objects.link(mantle)
  uv=mesh.uv_layers.new(name='UVMap')
  for poly in mesh.polygons:
   for li in poly.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
  texpath=CACHE/'jesus-mantle.png'
  image=bpy.data.images.new('Woven mantle',width=128,height=128)
  pixels=[]
  for yy in range(128):
   for xx in range(128):
    weave=1+(.035 if xx%3==0 else -.025)+(.025 if yy%3==0 else -.015)
    pixels.extend((.40*weave,.12*weave,.09*weave,1))
  image.pixels[:]=pixels;image.filepath_raw=str(texpath);image.file_format='PNG';image.save()
  mantle.data.materials.append(material('Mantle',texpath,roughness=.98))
  groups=[mantle.vertex_groups.new(name='mixamorig:'+name) for name in ['Hips','Spine','Spine1','Spine2']]
  for v in mantle.data.vertices:
   z=v.co.z;weights=[max(0,min(1,(1.03-z)/.2)),max(0,1-abs(z-1.05)/.18),max(0,1-abs(z-1.24)/.18),max(0,min(1,(z-1.24)/.15))]
   total=sum(weights) or 1
   for group,w in zip(groups,weights):
    if w:group.add([v.index],w/total,'REPLACE')
  mantle.parent=rig;mod=mantle.modifiers.new('Armature','ARMATURE');mod.object=rig
  solid=mantle.modifiers.new('Wool thickness','SOLIDIFY');solid.thickness=.004
  bpy.context.view_layer.objects.active=mantle;bpy.ops.object.modifier_apply(modifier=solid.name)
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH':continue
  freeze_shapes(obj)
  # Permanently apply helper/body cutout masks while retaining the armature modifier.
  bpy.context.view_layer.objects.active=obj
  for mod in list(obj.modifiers):
   if mod.type=='MASK':bpy.ops.object.modifier_apply(modifier=mod.name)
  # One subdivision gives facial and cloth silhouettes enough near-view resolution.
  sub=obj.modifiers.new('Surface refinement','SUBSURF');sub.levels=1
  bpy.ops.object.modifier_apply(modifier=sub.name)
 # Actual reduced meshes share the same skeleton and textures. The browser switches them.
 for obj in list(bpy.context.scene.objects):
  if obj.type!='MESH':continue
  bpy.context.view_layer.objects.active=obj
  if len(obj.data.polygons)>2000:
   dec=obj.modifiers.new('Near detail budget','DECIMATE');dec.ratio=.44 if conf['id']=='jesus' else .5
   bpy.ops.object.modifier_apply(modifier=dec.name)
  obj.name=obj.name+'_LOD0'
  lo=obj.copy();lo.data=obj.data.copy();lo.name=obj.name.replace('_LOD0','_LOD1');bpy.context.collection.objects.link(lo)
  bpy.context.view_layer.objects.active=lo
  dec=lo.modifiers.new('Distance detail','DECIMATE');dec.ratio=.18
  bpy.ops.object.modifier_apply(modifier=dec.name)
 # Normalize all skin influence counts at export, and keep garment weights fitted by MPFB.
 add_clips(rig)
 bpy.context.scene.frame_set(0)
 bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/(conf['id']+'.blend')))
 bpy.ops.object.select_all(action='SELECT')
 for track in rig.animation_data.nla_tracks:track.mute=False
 path=CACHE/(conf['id']+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_apply=False,export_image_format='AUTO',export_yup=True)
 data=path.read_bytes();digest=hashlib.sha256(data).hexdigest()
 record=dict(id=conf['id'],sourceGlb=path.name,bytes=len(data),sha256=digest)
 (CACHE/(conf['id']+'.json')).write_text(json.dumps(record,indent=2));print('CHARACTER',json.dumps(record),flush=True)
 if args.preview:
  for obj in bpy.context.scene.objects:
   if obj.type=='MESH' and '_LOD1' in obj.name:obj.hide_render=True
  for track in rig.animation_data.nla_tracks:track.mute=True
  # Evaluate idle instead of the source A pose.
  rig.animation_data.action=next(track.strips[0].action for track in rig.animation_data.nla_tracks if track.name=='idle');bpy.context.scene.frame_set(15)
  bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(material('Ground',color=(.18,.16,.13,1)))
  world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.52,.60,.70,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
  for loc,power,size in [((3,-4,5),500,4),((-3,-1,3),150,3)]:
   bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
  bpy.ops.object.camera_add(location=(2.25,-4.5,2.0));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65
  scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.filepath=str(CACHE/(conf['id']+'.png'));bpy.ops.render.render(write_still=True)
  if conf['id']=='artisan':
   rig.animation_data.action=next(track.strips[0].action for track in rig.animation_data.nla_tracks if track.name=='sit');scene.frame_set(15);scene.render.filepath=str(CACHE/'artisan-seated.png');bpy.ops.render.render(write_still=True)

for conf in CONFIGS:
 if not args.only or conf['id']==args.only:build(conf)
