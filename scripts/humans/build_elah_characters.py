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
 dict(id='david', gender=1., age=.23, muscle=.40, weight=.35, height=.44, skin='young_caucasian_male', hair='short02', color=(.82,.75,.59,1), meters=1.65),
 dict(id='goliath', gender=1., age=.61, muscle=1., weight=.82, height=.5, skin='middleage_caucasian_male', hair='short02', color=(.36,.25,.18,1), meters=2.9),
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
 bronze=mat('Elah hammered bronze',(.34,.205,.08),metallic=.88,roughness=.43)
 darkbronze=mat('Elah aged bronze',(.25,.15,.055),metallic=.8,roughness=.57)
 hip=rig.data.bones['mixamorig:Hips'].head_local.z
 shoulder=rig.data.bones['mixamorig:LeftArm'].head_local.z
 # Plain handwoven cloth: remove the source tunic's Greek-style decorative bands.
 cloth=mat('Elah plain woven cloth',(.48,.40,.28) if conf['id']=='david' else (.19,.12,.075),roughness=.97)
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH' and any(m.name.startswith('Cloth') for m in obj.data.materials):
   obj.data.materials.clear();obj.data.materials.append(cloth)
 waistverts=[v.co for v in tunic.data.vertices if abs(v.co.z-hip)<.045]
 wx=max(abs(v.x) for v in waistverts)+.008
 wy=(max(v.y for v in waistverts)-min(v.y for v in waistverts))/2+.008
 cy=(max(v.y for v in waistverts)+min(v.y for v in waistverts))/2
 shell('Narrow leather girdle',[(hip-.035,wx,wy,cy),(hip+.014,wx,wy,cy)],leather,rig)
 if conf['id']=='david':
  # Flat leather satchel at the hip, with a fitted broad shoulder strap.
  vs=[];fs=[];bx=-wx-.025;by=cy+.02
  for z,rx,ry in [(hip-.26,.05,.025),(hip-.24,.10,.045),(hip-.06,.095,.043),(hip-.04,.08,.035)]:
   base=len(vs)
   for i in range(16):
    t=i*math.tau/16;vs.append((bx+rx*math.cos(t),by+ry*math.sin(t),z))
    if base:fs.append((base-16+i,base-16+(i+1)%16,base+(i+1)%16,base+i))
  mesh('Shepherd leather satchel',vs,fs,leather,rig)
  top=rig.data.bones['mixamorig:Neck'].head_local.z-.06
  for panel in [-1,1]:
   vs=[];fs=[]
   for i in range(25):
    f=i/24;z=hip-.10+(top-hip+.10)*f;x=-wx+.02+(wx+.14)*f
    for edge in [-1,1]:
     xx=x+edge*.017;yy=cy+panel*(wy+.014)*math.sqrt(max(.1,1-(xx/(wx+.075))**2))
     vs.append((xx,yy,z))
    if i:fs.append((i*2-2,i*2-1,i*2+1,i*2))
   strap=mesh('Shepherd bag shoulder strap',vs,fs,leather,rig,'Spine')
 if conf['id']!='david':
  # Torso silhouette from fitted garment bounds; leaves arms free and exposes neckline.
  bottom=hip-.015;top=rig.data.bones['mixamorig:Neck'].head_local.z-.09
  chestWidth=abs(rig.data.bones['mixamorig:LeftArm'].head_local.x)*.98
  def radii(z):
   f=max(0,min(1,(z-bottom)/(top-bottom)))
   width=wx+(chestWidth-wx)*math.sin(f*math.pi*.8)
   torso=[v.co for v in tunic.data.vertices if abs(v.co.z-z)<.025 and abs(v.co.x)<chestWidth]
   if torso:
    ymin=min(v.y for v in torso);ymax=max(v.y for v in torso)
    return (max(width,max(abs(v.x) for v in torso)+.012),(ymax-ymin)/2+.018,(ymin+ymax)/2)
   return (width,wy*(1+.08*math.sin(f*math.pi))+.018,cy)
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
  if conf['id']=='goliath':
   # Short fitted scale sleeves add weight over the deltoids without inventing
   # giant fantasy pauldrons. Every sleeve follows its own upper-arm bone.
   for side in ['Left','Right']:
    arm=rig.data.bones['mixamorig:'+side+'Arm'];forearm=rig.data.bones['mixamorig:'+side+'ForeArm']
    axis=(forearm.head_local-arm.head_local).normalized()
    u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u).normalized()
    vs=[];fs=[];rows=5;cols=24;length=(forearm.head_local-arm.head_local).length*.65
    for j in range(rows):
     f=(j+.3)/rows;center=arm.head_local+axis*(length*f)
     # Approximate the actual fitted upper-arm radius from nearby skin.
     candidates=[]
     for vert in bpy.data.objects['Skin_LOD0'].data.vertices:
      delta=vert.co-center;along=delta.dot(axis)
      if abs(along)<.018 and delta.length<.16:candidates.append((delta-axis*along).length)
     radius=(max(candidates) if candidates else .085)+.009
     for i in range(cols):
      angle=(i+(j%2)*.5)*math.tau/cols;start=len(vs);step=math.tau/cols*.49;h=length/rows*1.35
      for dt,dz,out in [(-step,h*.45,0),(step,h*.45,0),(step,h*-.25,0),(0,h*-.55,0),(-step,h*-.25,0),(0,0,.006)]:
       t=angle+dt;vs.append(tuple(center+axis*dz+(u*math.cos(t)+v*math.sin(t))*(radius+out)))
      for k in range(5):fs.append((start+k,start+(k+1)%5,start+5))
    mesh(side+' bronze scale sleeve',vs,fs,bronze,rig,side+'Arm')
  # Dome helmet sits above brow, with rear/side skirt; no classical crest.
  skin=bpy.data.objects.get('Skin_LOD0')
  hair=next(o for o in bpy.context.scene.objects if o.type=='MESH' and '_LOD0' in o.name and any(m.name.startswith('Hair') for m in o.data.materials))
  scalp=max(max(v.co.z for v in skin.data.vertices),max(v.co.z for v in hair.data.vertices))
  eyes=next(o for o in bpy.context.scene.objects if o.type=='MESH' and '_LOD0' in o.name and any(m.name.startswith('Eyes') for m in o.data.materials))
  eyez=sum(v.co.z for v in eyes.data.vertices)/len(eyes.data.vertices)
  brow=eyez+.045;domeHeight=scalp+.023-brow
  headverts=[v.co for v in skin.data.vertices if v.co.z>eyez]
  rx=max(abs(v.x) for v in headverts)+.013
  ymin=min(v.y for v in headverts);ymax=max(v.y for v in headverts);cy=(ymin+ymax)/2;ry=(ymax-ymin)/2+.02
  # Hair would penetrate a fitted helmet; retain beard and exposed facial anatomy.
  for obj in list(bpy.context.scene.objects):
   if obj.type=='MESH' and any(m.name.startswith('Hair') for m in obj.data.materials):bpy.data.objects.remove(obj,do_unlink=True)
  rings=[]
  for j in range(13):
   theta=.025+(math.pi/2-.025)*j/12
   rings.append((scalp+.023-domeHeight*(1-math.cos(theta)),rx*math.sin(theta),ry*math.sin(theta),cy))
  shell('Bronze helmet dome',rings,bronze,rig,'Head')
  shell('Helmet brow band',[(brow-.013,rx*1.01,ry*1.01,cy),(brow+.013,rx*1.01,ry*1.01,cy)],darkbronze,rig,'Head')
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
 if conf['id']=='goliath':
  # Bake breadth into anatomy, costume and rest skeleton together. No runtime
  # non-uniform object scale: fingers, elbows and animation retargeting stay aligned.
  for obj in bpy.context.scene.objects:
   if obj.type=='MESH':
    for vert in obj.data.vertices:vert.co.x*=1.18;vert.co.y*=1.12
  bpy.context.view_layer.objects.active=rig;rig.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT')
  for bone in rig.data.edit_bones:
   for p in [bone.head,bone.tail]:p.x*=1.18;p.y*=1.12
  bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
 skin=bpy.data.objects['Skin_LOD0'];bodymin=min(v.co.z for v in skin.data.vertices);bodymax=max(v.co.z for obj in bpy.context.scene.objects if obj.type=='MESH' and '_LOD0' in obj.name and any(m.name.startswith(('Skin','Hair')) for m in obj.data.materials) for v in obj.data.vertices)
 factor=conf['meters']/(bodymax-bodymin)
 tunic=next(o for o in bpy.context.scene.objects if o.type=='MESH' and '_LOD0' in o.name and any(m.name.startswith('Cloth') for m in o.data.materials))
 before=set(bpy.context.scene.objects);extras(conf,rig,tunic)
 # The scale coat must bend with the chest as well as the lower spine. Transfer
 # the anatomical skin weights so a chest thump cannot push skin through a
 # single rigid torso shell.
 from mathutils.kdtree import KDTree
 tree=KDTree(len(skin.data.vertices))
 for vert in skin.data.vertices:tree.insert(vert.co,vert.index)
 tree.balance()
 for obj in set(bpy.context.scene.objects)-before:
  if obj.name not in ['Armor leather foundation','Overlapping bronze scales']:continue
  obj.vertex_groups.clear()
  groups={group.index:obj.vertex_groups.new(name=group.name) for group in skin.vertex_groups}
  for vert in obj.data.vertices:
   _,index,_=tree.find(vert.co)
   weights=[w for w in skin.data.vertices[index].groups if skin.vertex_groups[w.group].name in ['mixamorig:Hips','mixamorig:Spine','mixamorig:Spine1','mixamorig:Spine2']]
   total=sum(w.weight for w in weights)
   if total>.0001:
    for weight in weights:groups[weight.group].add([vert.index],weight.weight/total,'REPLACE')
   else:obj.vertex_groups['mixamorig:Spine2'].add([vert.index],1,'REPLACE')
 for o in set(bpy.context.scene.objects)-before:
  if o.type!='MESH':continue
  o.name += '_LOD0';lo=o.copy();lo.data=o.data.copy();lo.name=o.name.replace('_LOD0','_LOD1');bpy.context.collection.objects.link(lo)
  if len(lo.data.polygons)>150:
   bpy.context.view_layer.objects.active=lo;dec=lo.modifiers.new('Distance detail','DECIMATE');dec.ratio=.3;bpy.ops.object.modifier_apply(modifier=dec.name)
 physical=bpy.data.objects.new('PhysicalHeight',None);bpy.context.collection.objects.link(physical)
 for obj in list(bpy.context.scene.objects):
  if obj!=physical and obj.parent is None:obj.parent=physical
 physical.scale=(factor,)*3;physical.location.z=-bodymin*factor
 physical['bodyHeightMeters']=conf['meters'];physical['heightBasis']='sole to crown in bind pose, excludes helmet and weapons'
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
