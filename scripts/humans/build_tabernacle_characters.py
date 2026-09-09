"""Tabernacle-specific skinned costumes. Source reconstruction notes in docs/tabernacle-character-assets.md."""
import sys, math, json, runpy, argparse
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--mpfb',required=True);parser.add_argument('--only',default='');parser.add_argument('--preview',action='store_true')
a=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);REPO=Path(__file__).resolve().parents[2];CACHE=REPO/'scripts/.cache/tabernacle';CACHE.mkdir(parents=True,exist_ok=True)
sys.argv=['build_elah_characters.py','--','--source',a.source,'--mpfb',a.mpfb,'--only','__library__']
lib=runpy.run_path(str(Path(__file__).with_name('build_elah_characters.py')));g=lib['g'];g['CACHE']=CACHE
mat,mesh,tube,shell=[lib[n] for n in ['mat','mesh','tube','shell']]
CONFIGS=[dict(id='camp-man',gender=1.,age=.43,muscle=.52,weight=.47,height=.52,skin='young_caucasian_male',hair='short04',color=(.5,.4,.26,1),meters=1.70),dict(id='camp-woman',gender=0.,age=.4,muscle=.4,weight=.48,height=.45,skin='young_caucasian_female',hair='long01',color=(.48,.37,.28,1),meters=1.62),dict(id='levite',gender=1.,age=.4,muscle=.62,weight=.5,height=.54,skin='young_caucasian_male',hair='short03',color=(.65,.58,.43,1),meters=1.73),dict(id='priest',gender=1.,age=.48,muscle=.5,weight=.5,height=.52,skin='middleage_caucasian_male',hair='short02',color=(.9,.86,.73,1),meters=1.72),dict(id='high-priest',gender=1.,age=.65,muscle=.48,weight=.56,height=.55,skin='middleage_caucasian_male',hair='short02',color=(.88,.85,.73,1),meters=1.75)]
original_fit=g['fit']

def solid(name,location,scale,material,rig,bone='Spine2',kind='sphere'):
 if kind=='sphere':bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=location)
 else:bpy.ops.mesh.primitive_cube_add(size=2,location=location)
 obj=bpy.context.object;obj.name=name;obj.scale=scale;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 obj.data.materials.append(material);obj.parent=rig;vg=obj.vertex_groups.new(name='mixamorig:'+bone);vg.add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Deform','ARMATURE');mod.object=rig
 uv=obj.data.uv_layers
 if not uv:obj.data.uv_layers.new()
 return obj

def costume(conf,rig,skin,tunic):
 priest=conf['id'] in ['priest','high-priest'];high=conf['id']=='high-priest'
 linen=mat('Tabernacle fine linen' if priest else 'Tabernacle undyed woven cloth',(.88,.85,.75) if priest else conf['color'][:3],roughness=.94)
 blue=mat('Tabernacle blue robe',(.045,.13,.36),roughness=.9);gold=mat('Tabernacle gold',(.68,.43,.10),metallic=.86,roughness=.38)
 gold['preserveMetalness']=True
 hip=rig.data.bones['mixamorig:Hips'].head_local.z;neck=rig.data.bones['mixamorig:Neck'].head_local.z
 # Replace decorative source cloth and extend its skirt. The fitted upper
 # garment and original skin weights are retained, not wrapped in a cylinder.
 for obj in list(bpy.context.scene.objects):
  if obj.type=='MESH' and any(m.name.startswith('Cloth') for m in obj.data.materials):
   obj.data.materials.clear();obj.data.materials.append(linen)
   bottom=min(v.co.z for v in obj.data.vertices)
   for vert in obj.data.vertices:
    if vert.co.z<hip:vert.co.z=hip-(hip-vert.co.z)/(hip-bottom)*(hip-.075)
 def radii(z,pad=.015):
  chest=abs(rig.data.bones['mixamorig:LeftArm'].head_local.x)*1.05
  verts=[v.co for v in tunic.data.vertices if abs(v.co.z-z)<.035 and abs(v.co.x)<chest]
  if not verts:return (.21,.14,0)
  ymin=min(v.y for v in verts);ymax=max(v.y for v in verts)
  width=max(abs(v.x) for v in verts)+pad
  if z>neck-.16:width=min(width,chest*(1-.48*min(1,(z-neck+.16)/.16))+pad)
  return (width,(ymax-ymin)/2+pad,(ymax+ymin)/2)
 rx,ry,cy=radii(hip)
 # Close the source garment's high side slits with a continuous draped skirt.
 # The camp and attendants wear the same simple construction in earth tones.
 skirt=[]
 for j in range(18):
  f=j/17;z=.07+(hip+.015-.07)*f
  skirt.append((z,rx*(1.50-.50*f),ry*(1.28-.28*f),cy))
 shell('Continuous linen skirt' if priest else 'Continuous woven skirt',skirt,linen,rig)
 shell('Woven waist sash',[(hip-.035,rx+.006,ry+.006,cy),(hip+.025,rx+.006,ry+.006,cy)],linen,rig)
 # Long linen sleeves for Aaronic priests, following their own arm bones.
 if priest:
  for side in ['Left','Right']:
   arm=rig.data.bones['mixamorig:'+side+'Arm'];fore=rig.data.bones['mixamorig:'+side+'ForeArm'];hand=rig.data.bones['mixamorig:'+side+'Hand']
   for upper,lower,bname,radius in [(arm,fore,side+'Arm',.083),(fore,hand,side+'ForeArm',.066)]:
    axis=(lower.head_local-upper.head_local).normalized();u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u);vs=[];fs=[];n=24
    for j in range(7):
     f=j/6;center=upper.head_local.lerp(lower.head_local,f);r=radius*(1-.17*f)
     for i in range(n):
      t=i*math.tau/n;vs.append(tuple(center+(math.cos(t)*u+math.sin(t)*v)*r*(1+.025*math.sin(t*8))))
      if j:fs.append(((j-1)*n+i,(j-1)*n+(i+1)%n,j*n+(i+1)%n,j*n+i))
    mesh(side+' linen sleeve '+bname,vs,fs,linen,rig,bname)
 # Wrapped headcover with visible overlapping folds; cap shape is interpretive.
 eyes=next(o for o in bpy.context.scene.objects if o.type=='MESH' and '_LOD0' in o.name and any(m.name.startswith('Eyes') for m in o.data.materials));eyez=sum(v.co.z for v in eyes.data.vertices)/len(eyes.data.vertices)
 scalp=max(v.co.z for v in skin.data.vertices);hv=[v.co for v in skin.data.vertices if v.co.z>eyez]
 hx=max(abs(v.x) for v in hv)+.012;hy=(max(v.y for v in hv)-min(v.y for v in hv))/2+.015;hc=(max(v.y for v in hv)+min(v.y for v in hv))/2
 if priest or conf['id']=='levite':
  for o in list(bpy.context.scene.objects):
   if o.type=='MESH' and any(m.name.startswith('Hair') for m in o.data.materials):bpy.data.objects.remove(o,do_unlink=True)
  solid('Linen headcover', (0,hc,scalp-.055),(hx,hy,.10 if priest else .065),linen,rig,'Head')
  for j in range(5 if priest else 3):
   points=[]
   for i in range(65):
    t=i*math.tau/64;points.append((hx*math.cos(t),hc+hy*math.sin(t),eyez+.055+j*.019+.018*math.cos(t+j*.6)))
   tube('Turban wrap' if priest else 'Attendant headwrap',points,.013,linen,rig,'Head',sides=6)
 if not high:return
 # Fine blue robe: sleeveless over the linen tunic, under the ephod.
 rings=[]
 for j in range(28):
  z=.13+(neck-.045-.13)*j/27;r1,r2,c=radii(z,.028)
  if z<=hip:
   f=(z-.07)/(hip+.015-.07);r1=rx*(1.50-.50*f)+.018;r2=ry*(1.28-.28*f)+.018;c=cy
  rings.append((z,r1,r2,c))
 robe=shell('Blue robe of the ephod',rings,blue,rig,'Hips')
 # Distribute torso only above the waist; the draped lower robe follows pelvis.
 robe.vertex_groups.clear()
 for b in ['Hips','Spine','Spine1','Spine2']:robe.vertex_groups.new(name='mixamorig:'+b)
 for vert in robe.data.vertices:
  z=vert.co.z;f=max(0,min(1,(z-hip)/(neck-hip)));b='Hips' if z<hip else 'Spine' if f<.35 else 'Spine1' if f<.7 else 'Spine2';robe.vertex_groups['mixamorig:'+b].add([vert.index],1,'REPLACE')
 # Woven multicolor ephod: cloth, not a metal cuirass.
 woven=mat('Ephod gold blue purple scarlet linen',(.6,.45,.25),roughness=.84)
 import numpy as np
 image=next(n.image for n in woven.node_tree.nodes if n.type=='TEX_IMAGE');size=image.size[0];pixels=np.ones((size,size,4),dtype=np.float32)
 colors=[(.72,.49,.15),(.12,.22,.48),(.4,.12,.32),(.6,.13,.12),(.82,.78,.65)]
 for y in range(size):
  for x in range(size):pixels[y,x,:3]=(np.array(colors[((x//2)+(y//5))%5])*.55+np.array((.58,.44,.25))*.45)*(.86 if (x+y)%2 else 1)
 image.pixels.foreach_set(pixels.ravel());image.pack()
 bottom=hip-.12;top=neck-.075
 for side in [-1,1]:
  vs=[];fs=[]
  for j in range(18):
   z=bottom+(top-bottom)*j/17;r1,r2,c=radii(z,.043)
   r1=min(r1,abs(rig.data.bones['mixamorig:LeftArm'].head_local.x)*.95)
   for i in range(17):
    angle=-1.12+i*2.24/16;vs.append((r1*math.sin(angle),c+side*r2*math.cos(angle),z))
    if j and i:fs.append(((j-1)*17+i-1,(j-1)*17+i,j*17+i,j*17+i-1))
  mesh('Ephod front panel' if side==-1 else 'Ephod back panel',vs,fs,woven,rig,'Spine2')
 r1,r2,c=radii(hip,.047);shell('Ephod woven band',[(hip-.028,r1,r2,c),(hip+.03,r1,r2,c)],woven,rig)
 # Shoulder straps joined by two gold-set onyx stones.
 onyx=mat('Onyx shoulder stones',(.045,.035,.025),roughness=.27)
 for side in [-1,1]:
  x=side*.105;z=neck-.023
  tube('Ephod shoulder strap',[(x,-.11,top-.02),(x,-.055,z),(x,.035,z+.008),(x,.11,top-.02)],.034,woven,rig,'Spine2',sides=8)
  solid('Gold shoulder setting',(x,-.01,z+.018),(.045,.037,.013),gold,rig)
  solid('Onyx remembrance stone',(x,-.01,z+.03),(.034,.027,.012),onyx,rig)
 # Square breastpiece: four rows of three distinct stones, with gold settings.
 z=hip+(neck-hip)*.63;r1,r2,c=radii(z,.056);front=c-r2;span=.19
 solid('Breastpiece of judgment',(0,front-.008,z),(span/2,.012,span/2),woven,rig,kind='box')
 palette=[(.55,.04,.025),(.72,.46,.09),(.28,.1,.08),(.04,.34,.14),(.04,.12,.50),(.65,.72,.77),(.63,.29,.12),(.30,.41,.42),(.39,.10,.44),(.39,.58,.40),(.06,.055,.05),(.59,.3,.18)]
 for row in range(4):
  for col in range(3):
   n=row*3+col;x=(col-1)*.057;zz=z+.072-row*.048
   solid('Breastpiece gold setting '+str(n+1),(x,front-.025,zz),(.025,.009,.021),gold,rig,kind='box')
   gem=mat('Breastpiece stone '+str(n+1),palette[n],roughness=.22)
   stone=solid('Breastpiece stone '+str(n+1),(x,front-.038,zz),(.020,.009,.016),gem,rig);stone['row']=row+1;stone['column']=col+1
 for side in [-1,1]:
  tube('Gold breastpiece cord',[(side*.087,front-.016,z+.08),(side*.10,-.12,top),(side*.105,-.04,neck-.018)],.0045,gold,rig,'Spine2')
  tube('Blue breastpiece fastening',[(side*.09,front,z-.085),(side*.105,c-r2,hip+.02)],.004,blue,rig,'Spine2')
 # Alternating yarn pomegranates and gold bells around the blue robe hem.
 f=(.13-.07)/(hip+.015-.07);r1=rx*(1.50-.50*f)+.018;r2=ry*(1.28-.28*f)+.018;c=cy
 for i in range(24):
  t=i*math.tau/24;p=(r1*math.cos(t),c+r2*math.sin(t),.115)
  if i%2==0:
   solid('Gold hem bell '+str(i//2+1),p,(.013,.013,.017),gold,rig,'Hips')
   solid('Bell clapper '+str(i//2+1),(p[0],p[1],.098),(.004,.004,.005),gold,rig,'Hips')
  else:
   yarn=mat('Pomegranate yarn '+str(i),[(.11,.19,.4),(.38,.12,.31),(.6,.10,.08)][(i//2)%3]);solid('Yarn pomegranate '+str(i//2+1),p,(.014,.014,.017),yarn,rig,'Hips')
 # Gold forehead plate, blue fastening. Hebrew is rendered in a modern square
 # script for readability; letter forms are not claimed as period epigraphy.
 solid('Gold forehead plate',(0,hc-hy-.014,eyez+.075),(.082,.009,.028),gold,rig,'Head',kind='box')
 tube('Blue turban fastening',[(hx*math.cos(i*math.tau/64),hc+hy*math.sin(i*math.tau/64),eyez+.071) for i in range(65)],.005,blue,rig,'Head')
 fontpath=Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
 if fontpath.exists():
  bpy.ops.object.select_all(action='DESELECT')
  curve=bpy.data.curves.new('Holy to YHWH inscription','FONT');curve.body='קדש ליהוה'[::-1];curve.font=bpy.data.fonts.load(str(fontpath));curve.align_x='CENTER';curve.align_y='CENTER';curve.size=.025;curve.extrude=.0002
  obj=bpy.data.objects.new('Holy to YHWH inscription',curve);bpy.context.collection.objects.link(obj);obj.location=(0,hc-hy-.024,eyez+.075);obj.rotation_euler=(math.pi/2,0,0);bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  obj.data.uv_layers.new();obj.data.materials.append(mat('Inscription recess',(.13,.085,.02)));obj.parent=rig;vg=obj.vertex_groups.new(name='mixamorig:Head');vg.add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Deform','ARMATURE');mod.object=rig

def hide_covered_skin(rig):
 # Standard costume body masking: remove skin faces fully under the long robe
 # so knee bends cannot poke through it. Preserve head, hands and bare feet.
 import bmesh
 hip=rig.data.bones['mixamorig:Hips'].head_local.z
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH' or not any(m.name.startswith('Skin') for m in obj.data.materials):continue
  covered=set()
  for vert in obj.data.vertices:
   if not (.075<vert.co.z<hip+.035) or not vert.groups:continue
   deform=[w for w in vert.groups if obj.vertex_groups[w.group].name.startswith('mixamorig:')]
   if not deform:continue
   name=obj.vertex_groups[max(deform,key=lambda w:w.weight).group].name
   if any(part in name for part in ['Hips','UpLeg','Leg','Foot']):covered.add(vert.index)
  bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
  faces=[face for face in bm.faces if all(v.index in covered for v in face.verts)]
  bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(obj.data);bm.free();obj.data.update()

for conf in CONFIGS:
 if a.only and a.only!=conf['id']:continue
 def fit_with_beard(h,path,kind,material):
  obj=original_fit(h,path,kind,material)
  if conf['id']=='high-priest' and kind=='Eyebrows':
   bp=Path(a.source)/'beards/clothes/grinsegold_beard_sigmund_wip'
   original_fit(h,bp/'grinsegold_beard_sigmund_wip.mhclo','Clothes',g['material']('Beard',g['texture_from_mhmat'](next(bp.glob('*.mhmat'))),roughness=.9,alpha=True))
  return obj
 g['fit']=fit_with_beard
 g['build'](conf);bpy.ops.wm.open_mainfile(filepath=str(CACHE/(conf['id']+'.blend')))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 for track in rig.animation_data.nla_tracks:track.mute=True
 rig.animation_data.action=None
 for bone in rig.pose.bones:bone.rotation_mode='QUATERNION';bone.rotation_quaternion=Quaternion();bone.location=Vector()
 bpy.context.view_layer.update();skin=bpy.data.objects['Skin_LOD0'];tunic=next(o for o in bpy.context.scene.objects if o.type=='MESH' and '_LOD0' in o.name and any(m.name.startswith('Cloth') for m in o.data.materials))
 low=min(v.co.z for v in skin.data.vertices);high=max(v.co.z for v in skin.data.vertices);factor=conf['meters']/(high-low)
 before=set(bpy.context.scene.objects);costume(conf,rig,skin,tunic);hide_covered_skin(rig)
 for obj in set(bpy.context.scene.objects)-before:
  if obj.type!='MESH':continue
  obj.name+='_LOD0';lo=obj.copy();lo.data=obj.data.copy();lo.name=obj.name.replace('_LOD0','_LOD1');bpy.context.collection.objects.link(lo)
  if len(lo.data.polygons)>120:
   bpy.context.view_layer.objects.active=lo;dec=lo.modifiers.new('Distance detail','DECIMATE');dec.ratio=.35;bpy.ops.object.modifier_apply(modifier=dec.name)
 physical=bpy.data.objects.new('PhysicalHeight',None);bpy.context.collection.objects.link(physical)
 for obj in list(bpy.context.scene.objects):
  if obj!=physical and obj.parent is None:obj.parent=physical
 physical.scale=(factor,)*3;physical.location.z=-low*factor;physical['bodyHeightMeters']=conf['meters'];physical['tabernacleRole']=conf['id']
 bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/(conf['id']+'.blend')))
 for track in rig.animation_data.nla_tracks:track.mute=False
 bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(CACHE/(conf['id']+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_apply=False,export_image_format='AUTO',export_yup=True,export_extras=True)
 (CACHE/(conf['id']+'-measurements.json')).write_text(json.dumps(dict(bodyHeightMeters=conf['meters'],tabernacleRole=conf['id']),indent=2))
 if a.preview:
  for obj in bpy.context.scene.objects:
   if obj.type=='MESH' and '_LOD1' in obj.name:obj.hide_render=True
  for track in rig.animation_data.nla_tracks:track.mute=True
  rig.animation_data.action=next(t.strips[0].action for t in rig.animation_data.nla_tracks if t.name=='idle');bpy.context.scene.frame_set(0)
  bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(mat('Studio floor',(.15,.17,.19)))
  world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
  for pos,power,size in [((3,-4,6),850,4),((-3,-2,3),450,3),((1,3,4),1000,3)]:
   bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
  bpy.ops.object.camera_add(location=(1.4,-5,2.1));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.9))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.05
  scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=700;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(CACHE/(conf['id']+'.png'));bpy.ops.render.render(write_still=True)
