# Blender 4.2: 3D-иконки. Утверждён только helmet (карточка «Безопасность» в «Экипировке»);
# battery/umbrella/stopwatch заказчик отклонил. blender -b -P tools/render_icon.py -- helmet out.png 128
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
KIND, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 96

def hexc(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c] + [1]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection

def mat(name, color, metal=0.0, rough=0.5, coat=0.0, trans=0.0, ior=1.45, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexc(color)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Transmission Weight'].default_value = trans
    b.inputs['IOR'].default_value = ior
    if emit:
        b.inputs['Emission Color'].default_value = hexc(emit[0]); b.inputs['Emission Strength'].default_value = emit[1]
    return m

def link(o, m=None):
    if o.name not in col.objects: col.objects.link(o)
    if m: o.data.materials.append(m)
    return o

def prim(fn, m, **kw):
    fn(**kw); o = bpy.context.active_object
    if m: o.data.materials.append(m)
    return o

def smooth(o, bevel=0.0, seg=3, sub=0):
    if bevel:
        md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'
    if sub:
        md = o.modifiers.new('s', 'SUBSURF'); md.levels = sub; md.render_levels = sub
    for p in o.data.polygons: p.use_smooth = True
    return o

def poly_prism(name, pts, depth, m):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me), m)

YEL = mat('yellow', '#ffd400', rough=.32, coat=.7)
BLK = mat('black', '#15161a', rough=.4, coat=.5)
CHR = mat('chrome', '#d9dde3', metal=1, rough=.12)
STL = mat('steel', '#9aa0a8', metal=1, rough=.3)
RUB = mat('rubber', '#121316', rough=.85)
GLS = mat('glass', '#ffffff', rough=.0, trans=1, ior=1.5)
H2O = mat('water', '#ffffff', rough=.02, trans=1, ior=1.33)
WHT = mat('dial', '#f4f4f1', rough=.45, coat=1)
RED = mat('red', '#e8312a', rough=.3, coat=.6)
GOLD = mat('gold', '#e0a21a', metal=1, rough=.25)

cam_target = Vector((0, 0, 0)); cam_loc = Vector((3.2, -5.2, 2.6)); lens = 70

if KIND == 'battery':
    body = prim(bpy.ops.mesh.primitive_cube_add, BLK, size=1); body.scale = (1.5, 0.9, 1.0)
    bpy.ops.object.transform_apply(scale=True); smooth(body, .08, 4)
    top = prim(bpy.ops.mesh.primitive_cube_add, mat('grey', '#2a2d33', rough=.5), size=1); top.scale = (1.3, 0.7, 0.06); top.location.z = 0.52
    bpy.ops.object.transform_apply(scale=True); smooth(top, .025, 3)
    for x, m in ((-0.42, RED), (0.42, BLK)):
        prim(bpy.ops.mesh.primitive_cylinder_add, m, radius=.14, depth=.08, location=(x, 0, .58), vertices=48)
        t = prim(bpy.ops.mesh.primitive_cylinder_add, STL, radius=.085, depth=.22, location=(x, 0, .66), vertices=48); smooth(t, .015, 3)
    # «+» и «−» на крышке
    for d in ((.16, .04), (.04, .16)):
        o = prim(bpy.ops.mesh.primitive_cube_add, mat('w', '#e9e9e9', rough=.5), size=1, location=(-0.42, -0.26, .555)); o.scale = (d[0], d[1], .01)
    o = prim(bpy.ops.mesh.primitive_cube_add, mat('w2', '#e9e9e9', rough=.5), size=1, location=(0.42, -0.26, .555)); o.scale = (.16, .04, .01)
    # молния, утопленная в жёлтую полосу
    bolt = [(0.12, 0.36), (-0.17, -0.04), (0.0, -0.04), (-0.09, -0.36), (0.19, 0.07), (0.03, 0.07)]
    b = poly_prism('bolt', bolt, .04, YEL); b.rotation_euler = (math.pi / 2, 0, 0); b.location = (0, -0.43, -0.04)
    cam_target = Vector((0, 0, 0.05)); cam_loc = Vector((2.6, -5.4, 2.4)); lens = 62

elif KIND == 'umbrella':
    R, H, N, NR = 1.35, 0.55, 8, 24
    me = bpy.data.meshes.new('canopy'); bm = bmesh.new(); seg = 128
    rows = []
    for j in range(NR + 1):
        t = j / NR; row = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            k = abs(math.cos(N * a / 2))           # 1 на спице, 0 между спицами
            r = R * t * (1 - 0.06 * t * t * (1 - k))
            z = H * (1 - t ** 1.7) - 0.10 * t ** 3 * (1 - k)
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rows.append(row)
    for j in range(NR):
        for i in range(seg):
            f = bm.faces.new((rows[j][i], rows[j][(i + 1) % seg], rows[j + 1][(i + 1) % seg], rows[j + 1][i]))
            f.material_index = (i * N // seg) % 2
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me); bm.free()
    can = link(bpy.data.objects.new('canopy', me)); can.data.materials.append(YEL); can.data.materials.append(BLK)
    sol = can.modifiers.new('t', 'SOLIDIFY'); sol.thickness = 0.012
    smooth(can, sub=1)
    tip = prim(bpy.ops.mesh.primitive_uv_sphere_add, CHR, radius=.07, location=(0, 0, H + .05)); smooth(tip)
    shaft = prim(bpy.ops.mesh.primitive_cylinder_add, CHR, radius=.03, depth=1.9, location=(0, 0, H - .9), vertices=32); smooth(shaft)
    # J-ручка: половина тора
    hs = prim(bpy.ops.mesh.primitive_cylinder_add, BLK, radius=.055, depth=.45, location=(0, 0, -1.55), vertices=32); smooth(hs, .02, 3)
    j = prim(bpy.ops.mesh.primitive_torus_add, BLK, major_radius=.2, minor_radius=.055, location=(.2, 0, -1.775), rotation=(math.pi / 2, 0, 0), major_segments=48, minor_segments=16)
    bm = bmesh.new(); bm.from_mesh(j.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.001], context='VERTS')
    bm.to_mesh(j.data); bm.free(); smooth(j)
    import random; random.seed(4)
    # капли на куполе
    for _ in range(26):
        a = random.uniform(0, 2 * math.pi); t = random.uniform(.25, .95)
        r = R * t; z = H * (1 - t ** 1.7) + .01
        d = prim(bpy.ops.mesh.primitive_uv_sphere_add, H2O, radius=random.uniform(.025, .05), location=(r * math.cos(a), r * math.sin(a), z), segments=24, ring_count=12)
        d.scale.z = .45; smooth(d)
    # падающие капли
    for _ in range(0):
        x, y = random.uniform(-1.6, 1.6), random.uniform(-1.4, 1.4)
        if x * x + y * y < 0.5: continue
        d = prim(bpy.ops.mesh.primitive_uv_sphere_add, H2O, radius=.045, location=(x, y, random.uniform(.9, 1.8)), segments=24, ring_count=12)
        d.scale.z = 1.6; smooth(d)
    cam_target = Vector((0, 0, -0.55)); cam_loc = Vector((3.0, -5.0, 2.6)); lens = 58

elif KIND == 'stopwatch':
    def rx(o): o.rotation_euler = (math.pi / 2, 0, 0); return o
    body = rx(prim(bpy.ops.mesh.primitive_cylinder_add, CHR, radius=1.0, depth=.32, vertices=128)); smooth(body, .1, 6)
    bez = rx(prim(bpy.ops.mesh.primitive_torus_add, CHR, major_radius=.94, minor_radius=.05, location=(0, -.19, 0), major_segments=128, minor_segments=24))
    dial = rx(prim(bpy.ops.mesh.primitive_cylinder_add, WHT, radius=.9, depth=.02, location=(0, -.17, 0), vertices=128))
    for i in range(60):
        a = 2 * math.pi * i / 60; big = i % 5 == 0
        L = .14 if big else .06; r0 = .82 - L / 2
        t = prim(bpy.ops.mesh.primitive_cube_add, BLK, size=1, location=(r0 * math.sin(a), -.185, r0 * math.cos(a)))
        t.scale = (.028 if big else .012, .01, L); t.rotation_euler = (0, a, 0)
    # жёлтый сектор и стрелки
    hand = prim(bpy.ops.mesh.primitive_cube_add, RED, size=1, location=(0, -.18, 0)); hand.scale = (.025, .01, .78)
    hand.rotation_euler = (0, math.radians(52), 0); hand.location = (.30 * math.sin(math.radians(52)), -.2, .30 * math.cos(math.radians(52)))
    h2 = prim(bpy.ops.mesh.primitive_cube_add, BLK, size=1); h2.scale = (.04, .01, .45)
    h2.rotation_euler = (0, math.radians(-30), 0); h2.location = (.2 * math.sin(math.radians(-30)), -.195, .2 * math.cos(math.radians(-30)))
    cap = rx(prim(bpy.ops.mesh.primitive_cylinder_add, CHR, radius=.06, depth=.06, location=(0, -.21, 0), vertices=32))
    # кнопка и кольцо сверху
    stem = prim(bpy.ops.mesh.primitive_cylinder_add, CHR, radius=.1, depth=.22, location=(0, 0, 1.08), vertices=48); smooth(stem, .02, 3)
    btn = prim(bpy.ops.mesh.primitive_cylinder_add, CHR, radius=.16, depth=.14, location=(0, 0, 1.24), vertices=48); smooth(btn, .03, 4)
    ring = rx(prim(bpy.ops.mesh.primitive_torus_add, CHR, major_radius=.22, minor_radius=.045, location=(0, 0, 1.52), major_segments=64, minor_segments=16))
    ring.rotation_euler = (0, 0, 0)
    ring.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    for s in (-1, 1):
        sb = prim(bpy.ops.mesh.primitive_cylinder_add, CHR, radius=.08, depth=.16, location=(s * .78, 0, .78), vertices=32)
        sb.rotation_euler = (0, s * math.radians(45), 0); smooth(sb, .02, 3)
    cam_target = Vector((0, 0, .2)); cam_loc = Vector((1.7, -6.2, 1.6)); lens = 62

elif KIND == 'helmet':
    def sstep(a, b, x):
        t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=192, ring_count=128); sh = bpy.context.active_object
    me = sh.data; bm = bmesh.new(); bm.from_mesh(me)
    for v in bm.verts:
        d = v.co.normalized()
        x, y, z = d.x * .9, d.y * 1.08, d.z * 1.0
        ch = sstep(-.15, -.85, d.y) * sstep(.05, -.65, d.z)          # подбородок вперёд-вниз
        y -= .55 * ch; z -= .12 * ch; x *= 1 - .35 * ch
        if d.z < -.55: z = -.55 + (z + .55) * .3                       # срез снизу
        v.co = Vector((x, y, z))
    kill = [f for f in bm.faces if (lambda c: (c.z < -.6) or (c.y < -.55 and abs(c.x) < .5 and -.12 < c.z < .32))(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = 0
    bm.to_mesh(me); bm.free()
    me.materials.append(YEL); me.materials.append(BLK)
    so = sh.modifiers.new('s', 'SOLIDIFY'); so.thickness = .05; so.offset = -1
    smooth(sh, sub=1)
    liner = prim(bpy.ops.mesh.primitive_uv_sphere_add, mat('liner', '#0b0b0d', rough=.9), radius=.86, location=(0, .02, .05), segments=48, ring_count=24)
    liner.scale = (.92, 1.0, .95); smooth(liner)
    # очки: изогнутая линза + рамка + ремешок
    def arc(name, r, h, a0, a1, zc, m, th):
        me = bpy.data.meshes.new(name); bm = bmesh.new(); n = 40; rows = []
        for j in (0, 1):
            row = []
            for i in range(n + 1):
                a = math.radians(a0 + (a1 - a0) * i / n)
                row.append(bm.verts.new((r * math.sin(a) * .95, -r * math.cos(a), zc + (j - .5) * h)))
            rows.append(row)
        for i in range(n): bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new(name, me), m)
        so = o.modifiers.new('s', 'SOLIDIFY'); so.thickness = th; smooth(o, sub=1); return o
    LENS = mat('lens', '#ff8a1a', metal=1, rough=.06)
    arc('frame', 1.11, .40, -42, 42, .1, BLK, .07)
    arc('lens', 1.15, .29, -35, 35, .1, LENS, .02)
    strap = prim(bpy.ops.mesh.primitive_torus_add, mat('strap', '#16171a', rough=.7), major_radius=1.0, minor_radius=.03, location=(0, .03, .1), major_segments=96, minor_segments=12)
    strap.scale = (.92, 1.06, 3.0); smooth(strap)
    # козырёк
    me = bpy.data.meshes.new('peak'); bm = bmesh.new(); nx, nt = 24, 12; G = []
    for j in range(nt + 1):
        t = j / nt; row = []
        for i in range(nx + 1):
            u = -1 + 2 * i / nx; w = .72 - .22 * t
            row.append(bm.verts.new((u * w, -.78 - .95 * t * (1 - .25 * u * u), .42 + .26 * t - .10 * u * u)))
        G.append(row)
    for j in range(nt):
        for i in range(nx): bm.faces.new((G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]))
    bm.to_mesh(me); bm.free(); pk = link(bpy.data.objects.new('peak', me)); pk.data.materials.append(YEL)
    so = pk.modifiers.new('s', 'SOLIDIFY'); so.thickness = .05; smooth(pk, sub=2)
    # вентиляция на подбородке
    for k in range(0):
        g = prim(bpy.ops.mesh.primitive_cube_add, mat('vent%d' % k, '#3a3d44', metal=.6, rough=.35), size=1, location=(0, -1.6 + k * .04, -.40 + k * .08)); g.scale = (.16 - k * .02, .05, .03)
        bpy.ops.object.transform_apply(scale=True); smooth(g, .015, 3)
    cam_target = Vector((0, -.35, 0)); cam_loc = Vector((3.0, -5.2, 1.4)); lens = 60

# свет: софтбоксы для отражений, не видны в кадре
def softbox(loc, size, power, color='#ffffff'):
    bpy.ops.object.light_add(type='AREA', location=loc); l = bpy.context.active_object
    l.data.size = size; l.data.energy = power; l.data.color = hexc(color)[:3]
    d = cam_target - Vector(loc); l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
softbox((-4, -4, 5), 4, 900)
softbox((5, -2, 3), 3, 500, '#fff2d6')
softbox((0, 5, 4), 4, 700, '#cfe0ff')
softbox((0, -3, -3), 4, 150)

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
nt = w.node_tree; bg = nt.nodes['Background']
grad = nt.nodes.new('ShaderNodeTexGradient'); tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Rotation'].default_value = (0, -math.pi / 2, 0)
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.02, 0.02, 0.025, 1); ramp.color_ramp.elements[1].color = (0.9, 0.9, 0.95, 1)
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
nt.links.new(grad.outputs['Color'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = .6

bpy.ops.object.camera_add(location=cam_loc); cam = bpy.context.active_object
cam.rotation_euler = (cam_target - cam_loc).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 512
sc.view_settings.view_transform = 'Khronos PBR Neutral'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
