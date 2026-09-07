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
 dict(id='artisan',gender=1.0,age=.58,muscle=.57,weight=.48,skin='middleage_caucasian_male',hair='short02',color=(.36,.29,.19,1),height=.52),
 dict(id='villager',gender=0.0,age=.43,muscle=.42,weight=.49,skin='young_caucasian_female',hair='long01',color=(.24,.30,.32,1),height=.43),
 dict(id='traveler',gender=1.0,age=.37,muscle=.64,weight=.48,skin='young_caucasian_male',hair='short04',color=(.49,.39,.25,1),height=.58),
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
 if conf['id']=='artisan':
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
 if conf['gender']==0:
  # Lengthen the plain short-sleeved tunic into a modest household garment.
  for v in tunic.data.vertices:
   if v.co.z<.90:
    v.co.z=.90+(v.co.z-.90)*1.65;v.co.x*=1.22;v.co.y*=1.22
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
   dec=obj.modifiers.new('Near detail budget','DECIMATE');dec.ratio=.5
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
