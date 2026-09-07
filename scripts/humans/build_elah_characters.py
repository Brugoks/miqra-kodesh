"""Author dedicated Elah GLBs from the project's pinned MakeHuman/MPFB sources.
Blender --background --python scripts/humans/build_elah_characters.py --
  --source /tmp/miqra-human-assets --mpfb /tmp/miqra-mpfb [--preview]
Geometry, fitted costume and scale armor are exported; heights exclude equipment.
"""
import sys, math, json, runpy, argparse
from pathlib import Path
import bpy
from mathutils import Vector, Quaternion
parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--mpfb', required=True)
parser.add_argument('--preview', action='store_true')
parser.add_argument('--only', default='')
a = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
REPO = Path(__file__).resolve().parents[2]
CACHE = REPO / 'scripts/.cache/elah'
CACHE.mkdir(parents=True, exist_ok=True)
sys.argv = ['build_characters.py', '--', '--source', a.source, '--mpfb', a.mpfb, '--only', '__library__']
lib = runpy.run_path(str(Path(__file__).with_name('build_characters.py')))
g = lib['build'].__globals__
g['CACHE'] = CACHE
original_fit = g['fit']
CONFIGS = [
 dict(id='david', gender=1., age=.23, muscle=.40, weight=.35, height=.44, skin='young_caucasian_male', hair='short04', color=(.82,.75,.59,1), meters=1.65),
 dict(id='goliath', gender=1., age=.61, muscle=.92, weight=.64, height=.8, skin='middleage_caucasian_male', hair='short02', color=(.36,.25,.18,1), meters=2.9),
 dict(id='shield-bearer', gender=1., age=.45, muscle=.65, weight=.48, height=.53, skin='young_caucasian_male', hair='short03', color=(.43,.34,.24,1), meters=1.75),
]

def mat(name, rgb, metallic=0, roughness=.8):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=roughness
 # Actual embedded mottled material texture, rather than unsupported shader noise.
 import numpy as np
 size=128;rng=np.random.default_rng(17)
 image=bpy.data.images.new(name+' surface',width=size,height=size)
 yy,xx=np.mgrid[:size,:size]
 detail=1+rng.normal(0,.035,(size,size))+.02*np.sin(xx*.6)*np.cos(yy*.5)
 pix=np.ones((size,size,4),dtype=np.float32);pix[:,:,:3]=np.array(rgb)*detail[:,:,None]
 image.pixels.foreach_set(pix.ravel());image.pack()
 node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
 return m

def mesh(name,verts,faces,material,rig,bone='Hips'):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);data.materials.append(material)
 uv=data.uv_layers.new()
 for poly in data.polygons:
  poly.use_smooth=True
  for li in poly.loop_indices:
   v=data.vertices[data.loops[li].vertex_index].co;uv.data[li].uv=(v.x*3,v.z*3)
 obj.parent=rig
 group=obj.vertex_groups.new(name='mixamorig:'+bone);group.add(list(range(len(verts))),1,'REPLACE')
 mod=obj.modifiers.new('Deform','ARMATURE');mod.object=rig
 return obj

def tube(name,points,radius,material,rig,bone='Hips',sides=8):
 vs=[];fs=[]
 for j,p in enumerate(points):
  p=Vector(p);d=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])
  d.normalize();u=d.cross(Vector((0,1,0)))
  if u.length<.01:u=d.cross(Vector((1,0,0)))
  u.normalize();v=d.cross(u)
  for i in range(sides):vs.append(tuple(p+radius*(math.cos(i*math.tau/sides)*u+math.sin(i*math.tau/sides)*v)))
  if j:
   for i in range(sides):fs.append(((j-1)*sides+i,(j-1)*sides+(i+1)%sides,j*sides+(i+1)%sides,j*sides+i))
 fs.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))])
 return mesh(name,vs,fs,material,rig,bone)

def shell(name,rings,material,rig,bone='Hips'):
 vs=[];fs=[];n=48
 for j,(z,rx,ry,cy) in enumerate(rings):
  for i in range(n):
   t=i*math.tau/n;vs.append((rx*math.cos(t),cy+ry*math.sin(t),z))
   if j:fs.append(((j-1)*n+i,(j-1)*n+(i+1)%n,j*n+(i+1)%n,j*n+i))
 return mesh(name,vs,fs,material,rig,bone)

def extras(conf,rig,tunic):
 leather=mat('Elah worn leather',(.20,.105,.048),roughness=.87)
 bronze=mat('Elah hammered bronze',(.43,.27,.10),metallic=.88,roughness=.46)
 darkbronze=mat('Elah aged bronze',(.25,.15,.055),metallic=.8,roughness=.57)
 hip=rig.data.bones['mixamorig:Hips'].head_local.z
 shoulder=rig.data.bones['mixamorig:LeftArm'].head_local.z
 # Fitted belt / bag use the existing garment-envelope authoring function.
 g['add_belt_and_purse'](rig,tunic,conf)
 if conf['id']=='david':
  # Broad cross-body leather strap, lying on the garment front/back.
  for side in [-1,1]:
   pts=[]
   for i in range(17):
    f=i/16;z=hip-.04+(shoulder-hip+.025)*f;x=-.19+.35*f
    rad=g['waist_radii'](tunic,z-.035,z+.035,48)
    ry=max(rad)*.72+.022
    pts.append((x,side*ry,z))
   tube('Shepherd bag shoulder strap',pts,.014,leather,rig,'Spine',8)
 if conf['id']!='david':
  # Torso silhouette from fitted garment bounds; leaves arms free and exposes neckline.
  bottom=hip+.03;top=shoulder-.06
  def radii(z):
   verts=[v.co for v in tunic.data.vertices if abs(v.co.z-z)<.035 and abs(v.co.x)<.30]
   if not verts:return (.235,.155,0)
   return (max(abs(v.x) for v in verts)+.018,(max(v.y for v in verts)-min(v.y for v in verts))/2+.021,(max(v.y for v in verts)+min(v.y for v in verts))/2)
  rings=[]
  for j in range(14):
   z=bottom+(top-bottom)*j/13;rx,ry,cy=radii(z);rings.append((z,rx,ry,cy))
  shell('Armor leather foundation',rings,leather,rig,'Spine')
  # Individually domed overlapping scale plates; one combined weighted mesh, not hundreds of draws.
  vs=[];fs=[];rows=12 if conf['id']=='goliath' else 8;cols=36
  for j in range(rows):
   z=bottom+(top-bottom)*(j+.35)/rows;rx,ry,cy=radii(z)
   for i in range(cols):
    angle=(i+(j%2)*.5)*math.tau/cols
    start=len(vs);step=math.tau/cols*.49;h=(top-bottom)/rows*1.35
    for dt,dz,out in [(-step,h*.45,0),(step,h*.45,0),(step,h*-.25,0),(0,h*-.55,0),(-step,h*-.25,0),(0,0,.009)]:
     t=angle+dt;vs.append(((rx+.004+out)*math.cos(t),cy+(ry+.004+out)*math.sin(t),z+dz))
    for k in range(5):fs.append((start+k,start+(k+1)%5,start+5))
  mesh('Overlapping bronze scales',vs,fs,bronze,rig,'Spine')
  # Dome helmet sits above brow, with rear/side skirt; no classical crest.
  skin=bpy.data.objects.get('Skin_LOD0')
  scalp=max(v.co.z for v in skin.data.vertices)
  head=rig.data.bones['mixamorig:Head'].head_local
  headverts=[v.co for v in skin.data.vertices if v.co.z>scalp-.20]
  rx=max(abs(v.x) for v in headverts)+.012
  ymin=min(v.y for v in headverts);ymax=max(v.y for v in headverts);cy=(ymin+ymax)/2;ry=(ymax-ymin)/2+.014
  rings=[]
  for j in range(13):
   theta=.025+(math.pi/2-.025)*j/12
   rings.append((scalp+.018-.17*(1-math.cos(theta)),rx*math.sin(theta),ry*math.sin(theta),cy))
  shell('Bronze helmet dome',rings,bronze,rig,'Head')
  shell('Helmet brow band',[(scalp-.165,rx*1.01,ry*1.01,cy),(scalp-.135,rx*1.01,ry*1.01,cy)],darkbronze,rig,'Head')
  for side in ['Left','Right']:
   shin=rig.data.bones['mixamorig:'+side+'Leg'];ankle=rig.data.bones['mixamorig:'+side+'Foot'].head_local
   vs=[];fs=[];n=18
   for row in range(8):
    f=row/7;center=ankle.lerp(shin.head_local,.12+.76*f);rx=.05+.025*math.sin(f*math.pi);ry=rx*.85
    for i in range(n):
     t=-math.pi*.92+i/(n-1)*math.pi*.84
     vs.append((center.x+rx*math.cos(t),center.y+ry*math.sin(t)-.018,center.z))
     if row and i:fs.append(((row-1)*n+i-1,(row-1)*n+i,row*n+i,row*n+i-1))
   mesh(side+' fitted greave',vs,fs,bronze,rig,side+'Leg')
 # Sandal soles and leather straps measured off feet.
 for side in ['Left','Right']:
  foot=rig.data.bones['mixamorig:'+side+'Foot'];cx=foot.head_local.x
  toe=rig.data.bones['mixamorig:'+side+'ToeBase'].head_local
  y0=toe.y-.06;y1=foot.head_local.y+.055;z=.016
  vs=[(cx+x,y,z+dz) for dz in [-.009,.009] for x,y in [(-.048,y0),(.048,y0),(.047,y1),(-.047,y1)]]
  mesh(side+' leather sandal sole',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],leather,rig,side+'Foot')
  for y in [y0+.055,y1-.035]:
   tube(side+' sandal strap',[(cx-.052,y,.035),(cx-.036,y,.077),(cx+.036,y,.077),(cx+.052,y,.035)],.009,leather,rig,side+'Foot')

for conf in CONFIGS:
 if a.only and conf['id']!=a.only:continue
 def fit_with_beard(h,path,kind,material):
  obj=original_fit(h,path,kind,material)
  if conf['id']=='goliath' and kind=='Eyebrows':
   bp=Path(a.source)/'beards/clothes/grinsegold_beard_sigmund_wip'
   original_fit(h,bp/'grinsegold_beard_sigmund_wip.mhclo','Clothes',g['material']('Beard',g['texture_from_mhmat'](next(bp.glob('*.mhmat'))),roughness=.9,alpha=True))
  return obj
 g['fit']=fit_with_beard
 g['build'](conf)
 bpy.ops.wm.open_mainfile(filepath=str(CACHE/(conf['id']+'.blend')))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 for track in rig.animation_data.nla_tracks:track.mute=True
 rig.animation_data.action=None
 for b in rig.pose.bones:b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion();b.location=Vector()
 bpy.context.view_layer.update()
 skin=bpy.data.objects['Skin_LOD0'];bodymin=min(v.co.z for v in skin.data.vertices);bodymax=max(v.co.z for v in skin.data.vertices)
 factor=conf['meters']/(bodymax-bodymin)
 tunic=next(o for o in bpy.context.scene.objects if o.type=='MESH' and '_LOD0' in o.name and any(m.name.startswith('Cloth') for m in o.data.materials))
 before=set(bpy.context.scene.objects);extras(conf,rig,tunic)
 for o in set(bpy.context.scene.objects)-before:
  if o.type!='MESH':continue
  o.name += '_LOD0';lo=o.copy();lo.data=o.data.copy();lo.name=o.name.replace('_LOD0','_LOD1');bpy.context.collection.objects.link(lo)
  if len(lo.data.polygons)>150:
   bpy.context.view_layer.objects.active=lo;dec=lo.modifiers.new('Distance detail','DECIMATE');dec.ratio=.3;bpy.ops.object.modifier_apply(modifier=dec.name)
 physical=bpy.data.objects.new('PhysicalHeight',None);bpy.context.collection.objects.link(physical)
 for obj in list(bpy.context.scene.objects):
  if obj!=physical and obj.parent is None:obj.parent=physical
 physical.scale=(factor,)*3;physical.location.z=-bodymin*factor
 physical['bodyHeightMeters']=conf['meters'];physical['heightBasis']='sole to scalp in bind pose, excludes hair, helmet and weapons'
 bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/(conf['id']+'.blend')))
 for track in rig.animation_data.nla_tracks:track.mute=False
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath=str(CACHE/(conf['id']+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_apply=False,export_image_format='AUTO',export_yup=True,export_extras=True)
 (CACHE/(conf['id']+'-measurements.json')).write_text(json.dumps(dict(bodyHeightMeters=conf['meters'],sourceBodyHeight=bodymax-bodymin,scale=factor),indent=2))
 print('ELAH_CHARACTER',conf['id'],conf['meters'],flush=True)
 if a.preview:
  for o in bpy.context.scene.objects:
   if o.type=='MESH' and '_LOD1' in o.name:o.hide_render=True
  for track in rig.animation_data.nla_tracks:track.mute=True
  rig.animation_data.action=next(t.strips[0].action for t in rig.animation_data.nla_tracks if t.name=='idle');bpy.context.scene.frame_set(0)
  bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(mat('Studio ground',(.15,.17,.19)))
  world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
  for pos,power,size in [((3,-4,6),850,4),((-3,-2,3),450,3),((1,3,4),1000,3)]:
   bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,conf['meters']/2))-light.location).to_track_quat('-Z','Y').to_euler()
  bpy.ops.object.camera_add(location=(3,-6,2.5));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,conf['meters']/2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.4
  scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(CACHE/(conf['id']+'.png'));bpy.ops.render.render(write_still=True)
