import bpy, bmesh, math, sys
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
BIKE, HELMET, JERSEY, NUM, OUT = argv[0], argv[1], argv[2], argv[3], argv[4]
SAMPLES = int(argv[5]) if len(argv) > 5 else 96

def hexc(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c] + [1]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection

def mat(name, color, metal=0.0, rough=0.5, coat=0.0, sheen=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexc(color) if isinstance(color, str) else color
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Sheen Weight'].default_value = sheen
    return m

M = dict(
    rubber=mat('rubber', '#121316', rough=.85),
    alu=mat('alu', '#c9ced6', metal=1, rough=.22),
    steel=mat('steel', '#8d939c', metal=1, rough=.35),
    dark=mat('dark', '#18191d', metal=.3, rough=.4, coat=.6),
    gold=mat('gold', '#e0a21a', metal=1, rough=.25),
    plastic=mat('plastic', BIKE, rough=.28, coat=.8),
    white=mat('white', '#f2f3f5', rough=.3, coat=.6),
    seat=mat('seat', '#16171a', rough=.7),
    battery=mat('battery', '#2a2d33', metal=.2, rough=.45),
    yellow=mat('yellow', '#ffd400', rough=.35, coat=.5),
    helmet=mat('helmet', HELMET, rough=.2, coat=1),
    lens=mat('lens', '#ff8a1a', metal=1, rough=.05),
    jersey=mat('jersey', JERSEY, rough=.8, sheen=.6),
    pants=mat('pants', '#2c313b', rough=.85, sheen=.4),
    glove=mat('glove', '#15161a', rough=.7),
    boot=mat('boot', '#eef0f3', rough=.35, coat=.5),
    black=mat('black', '#0d0e10', rough=.5),
)

def link(o, m=None):
    if m: o.data.materials.append(m)
    return o

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True

def cyl_between(a, b, r, m, verts=24):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    smooth(o); return link(o, m)

def sphere(c, r, m, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r, location=c)
    o = bpy.context.object; o.scale = scale; smooth(o); return link(o, m)

def tube(points, r, m):
    cu = bpy.data.curves.new('tube', 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = r; cu.bevel_resolution = 6; cu.use_fill_caps = True
    sp = cu.splines.new('NURBS'); sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points): p.co = (*q, 1)
    sp.use_endpoint_u = True; sp.order_u = min(3, len(points))
    o = bpy.data.objects.new('tube', cu); col.objects.link(o); return link(o, m)

def profile(pts, y0, width, m, bevel=0.008, sub=2):
    """Плоский профиль в плоскости XZ, выдавленный по Y (пластик, сиденье, таблички)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y0 - width / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.y += width
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('p'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('p', me); col.objects.link(o)
    bv = o.modifiers.new('b', 'BEVEL'); bv.width = bevel; bv.segments = 3; bv.limit_method = 'ANGLE'
    if sub:
        s = o.modifiers.new('s', 'SUBSURF'); s.levels = sub; s.render_levels = sub
    smooth(o); return link(o, m)

def box(c, size, m, bevel=0.01, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c); o = bpy.context.object
    o.scale = size
    if rot: o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new('b', 'BEVEL'); bv.width = bevel; bv.segments = 4
    smooth(o); return link(o, m)

# ---------- колёса ----------
def wheel(cx, cz, R, w):
    bpy.ops.mesh.primitive_torus_add(major_radius=R - w * .55, minor_radius=w * .55, major_segments=96, minor_segments=24,
                                     location=(cx, 0, cz), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object; smooth(t); link(t, M['rubber'])
    n = 34
    for i in range(n):
        a = i / n * 2 * math.pi
        for side in (-1, 1):
            r = R - 0.004
            box((cx + math.cos(a) * r, side * w * .38, cz + math.sin(a) * r), (0.022, w * .45, 0.028), M['rubber'], 0.004,
                rot=(0, -a, 0))
    for y in (-w * .3, w * .3):
        bpy.ops.mesh.primitive_torus_add(major_radius=R - w - 0.012, minor_radius=0.011, major_segments=96, minor_segments=12,
                                         location=(cx, y, cz), rotation=(math.pi / 2, 0, 0))
        o = bpy.context.object; smooth(o); link(o, M['alu'])
    rr = R - w - 0.02
    for i in range(28):
        a = i / 28 * 2 * math.pi; side = 1 if i % 2 else -1
        a0 = a + (0.35 if i % 4 < 2 else -0.35)
        cyl_between((cx + math.cos(a0) * .028, side * .03, cz + math.sin(a0) * .028),
                    (cx + math.cos(a) * rr, side * w * .25, cz + math.sin(a) * rr), 0.0022, M['steel'], 8)
    cyl_between((cx, -.05, cz), (cx, .05, cz), 0.03, M['alu'])
    cyl_between((cx, -.072, cz), (cx, -.066, cz), .075, M['steel'], 48)   # тормозной диск
    cyl_between((cx, -.074, cz), (cx, -.064, cz), .035, M['alu'], 32)

RA, FA = Vector((0, 0, .25)), Vector((.95, 0, .27))
wheel(RA.x, RA.z, .25, .075)
wheel(FA.x, FA.z, .27, .07)

# ---------- ходовая ----------
for y in (-.06, .06):
    cyl_between((.42, y, .36), (RA.x, y, RA.z), .022, M['alu'])
cyl_between((.30, 0, .62), (.40, 0, .37), .018, M['steel'])
bpy.ops.curve.primitive_curve_add if False else None
spring = []
for i in range(120):
    t = i / 119; a = t * 2 * math.pi * 9
    p = Vector((.30, 0, .62)).lerp(Vector((.38, 0, .41)), t)
    spring.append((p.x + math.cos(a) * .035, p.y + math.sin(a) * .035, p.z))
tube(spring, .007, M['gold'])
# рама
tube([(.80, 0, .74), (.60, 0, .66), (.30, 0, .66), (.18, 0, .72)], .02, M['dark'])
tube([(.80, 0, .72), (.70, 0, .40), (.46, 0, .30), (.40, 0, .36)], .022, M['dark'])
cyl_between((.79, 0, .66), (.82, 0, .90), .03, M['dark'])
# батарея и мотор
box((.56, 0, .50), (.34, .15, .22), M['battery'], .02)
bolt = [(.53, .55), (.565, .55), (.55, .51), (.585, .52), (.545, .45), (.555, .49), (.525, .485)]
profile([(x, z) for x, z in bolt], -.077, .004, M['yellow'], .001, 0)
cyl_between((.42, -.06, .33), (.42, .06, .33), .075, M['steel'], 48)
cyl_between((.42, -.075, .33), (.42, -.06, .33), .04, M['alu'], 32)
# цепь и звёзды
cyl_between((RA.x, -.085, RA.z), (RA.x, -.079, RA.z), .07, M['dark'], 48)   # звезда
for i in range(30):
    a = i / 30 * 2 * math.pi
    box((RA.x + math.cos(a) * .072, -.082, RA.z + math.sin(a) * .072), (.012, .006, .012), M['dark'], .002, rot=(0, -a, 0))
tube([(.42, -.085, .37), (.2, -.085, .355), (RA.x, -.085, RA.z + .085)], .006, M['black'])
tube([(.42, -.085, .29), (.2, -.085, .23), (RA.x, -.085, RA.z - .085)], .006, M['black'])
# подножки
cyl_between((.44, -.16, .36), (.44, .16, .36), .014, M['steel'])

# ---------- вилка и руль ----------
TOP, AX = Vector((.80, 0, .88)), FA
for y in (-.075, .075):
    a, b = TOP + Vector((0, y, 0)), AX + Vector((0, y, 0))
    mid = a.lerp(b, .45)
    cyl_between(a, mid, .022, M['gold'])
    cyl_between(mid - (b - a).normalized() * .03, b, .03, M['dark'])
box((.80, 0, .885), (.07, .2, .035), M['alu'], .008)
box((.825, 0, .78), (.07, .2, .035), M['alu'], .008)
tube([(.77, -.30, .99), (.79, -.15, .97), (.80, 0, .92), (.79, .15, .97), (.77, .30, .99)], .011, M['black'])
for y in (-.27, .27): cyl_between((.77, y - .05, .99), (.77, y + .05, .99), .018, M['rubber'])
cyl_between((.80, -.22, 1.0), (.88, -.25, .99), .006, M['steel'])
# суппорт
box((FA.x - .07, -.085, FA.z + .07), (.06, .03, .04), M['gold'], .01)

# ---------- пластик ----------
arc = [(FA.x + math.cos(math.radians(a)) * .35, FA.z + math.sin(math.radians(a)) * .35 - .02) for a in range(150, 15, -10)]
inner = [(FA.x + math.cos(math.radians(a)) * .33, FA.z + math.sin(math.radians(a)) * .33 - .02) for a in range(15, 151, 10)]
profile(arc + inner, 0, .13, M['plastic'], .006)
profile([(.46, .70), (.05, .74), (-.24, .83), (-.28, .82), (-.26, .79), (.05, .69), (.44, .65)], 0, .19, M['plastic'], .01)
profile([(.10, .715), (.56, .745), (.60, .79), (.50, .80), (.12, .76)], 0, .17, M['seat'], .02)
for y in (-.11, .11):
    profile([(.20, .69), (.47, .70), (.48, .52), (.30, .46), (.19, .55)], y, .015, M['white'], .006)
    profile([(.52, .78), (.82, .82), (.80, .60), (.62, .53), (.50, .62)], y * 1.15, .03, M['plastic'], .01)
    profile([(.56, .70), (.79, .71), (.79, .66), (.60, .62)], y * 1.15 + (.017 if y > 0 else -.017), .004, M['white'], .002, 1)
profile([(.48, .76), (.80, .83), (.82, .76), (.52, .69)], 0, .22, M['plastic'], .015)
fp = box((.875, 0, .80), (.02, .2, .2), M['white'], .02, rot=(0, math.radians(-14), 0))
# номер на боковой табличке
bpy.ops.object.text_add(location=(.335, -.12, .575), rotation=(math.pi / 2, 0, 0))
tx = bpy.context.object; tx.data.body = NUM; tx.data.align_x = 'CENTER'; tx.data.align_y = 'CENTER'
tx.data.size = .14 if len(NUM) == 1 else .11; tx.data.extrude = .002; link(tx, M['black'])

# ---------- сцена: свет, тень, камера ----------
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.0))
g = bpy.context.object; g.is_shadow_catcher = True
def area(loc, size, power, color=(1, 1, 1)):
    l = bpy.data.lights.new('a', 'AREA'); l.size = size; l.energy = power; l.color = color
    o = bpy.data.objects.new('a', l); col.objects.link(o); o.location = loc
    d = Vector((.47, 0, .6)) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
area((-1.2, -2.6, 2.6), 2.5, 260)
area((2.4, -1.6, 1.2), 2.0, 70)
area((1.0, 2.5, 2.2), 1.5, 260, (1, .95, .85))
area((.5, 0, 4), 4, 90)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (.03, .035, .045, 1)
cam = bpy.data.cameras.new('c'); cam.lens = 60
co = bpy.data.objects.new('c', cam); col.objects.link(co); sc.camera = co
co.location = (-.75, -4.2, 1.05)
co.rotation_euler = (Vector((.47, 0, .45)) - co.location).to_track_quat('-Z', 'Y').to_euler()

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True; sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = 1500, 1000
sc.view_settings.view_transform = 'Khronos PBR Neutral'
sc.render.filepath = OUT; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
bpy.ops.render.render(write_still=True)
print('DONE', OUT)
