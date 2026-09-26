#!/usr/bin/env python3
"""Bakes the land around Capernaum from real elevation data.

Writes two small committed modules the scene builder reads:

  src/components/scene/capernaumTerrainData.js
      A height grid, in scene metres, covering the ground within about a
      kilometre of the village: the slope up toward the Korazim plateau, the
      Eremos ridge to the west, and the shore bending away east and west.

  src/components/scene/capernaumHorizonData.js
      The far skyline as ribbons at true compass bearings and true angular
      heights: the Korazim/Eremos slope, Arbel's wedge and cliff, the Horns of
      Hattin, the Golan wall across the water, Hippos, the hills behind
      Tiberias, and Gilead faint at the south end of the lake. Mount Hermon,
      Tabor, Meron and Chorazin are deliberately absent — from Capernaum's
      shore they are hidden behind nearer ground, and drawing them would be the
      one mistake anybody who has stood there would notice.

Source: SRTM-derived elevation tiles, AWS Terrain Tiles ("terrarium"
encoding) at zoom 12, about 32 m a pixel, fetched from
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/{x}/{y}.png into the
ignored cache scripts/.cache/capernaum-dem/ (downloaded on first run).
Cross-checked against OpenTopoData srtm30m along the Hermon sightline.

Scene conventions: origin at the village (32.8806 N, 35.5752 E), +X east,
+Z north, metres. Scene y = height above sea level + 208.85, so the village
ground is 0 and the lake at its first-century level of -210 m is -1.15.
Horizon angles are taken from an eye 2 m above that lake, with curvature and
refraction as a drop of 0.0675 d_km^2 metres.

Usage:  python3 scripts/build-capernaum-landscape.py
"""

import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.cache', 'capernaum-dem')
OUT_TERRAIN = os.path.join(ROOT, 'src', 'components', 'scene', 'capernaumTerrainData.js')
OUT_HORIZON = os.path.join(ROOT, 'src', 'components', 'scene', 'capernaumHorizonData.js')

ZOOM = 12
N = 2 ** ZOOM
X0, X1, Y0, Y1 = 2446, 2460, 1641, 1661  # tiles covering 32.15-33.6 N, 35.05-36.25 E
LAT0, LON0 = 32.8806, 35.5752
R = 6371008.8
LAKE_ASL = -210.0
SCENE_OFFSET = 208.85  # scene y = ASL + this
EYE_ASL = LAKE_ASL + 2.0
EYE_Y = LAKE_ASL + 2.0 + SCENE_OFFSET  # 0.85 in scene metres

# The terrain grid: square, centred on the village, this spacing.
GRID_HALF = 900
GRID_STEP = 30


def tile_path(x, y):
    return os.path.join(CACHE, f'z12_{x}_{y}.png')


def fetch_tiles():
    os.makedirs(CACHE, exist_ok=True)
    for x in range(X0, X1 + 1):
        for y in range(Y0, Y1 + 1):
            path = tile_path(x, y)
            if os.path.exists(path):
                continue
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png'
            print('fetching', url)
            urllib.request.urlretrieve(url, path)


def load_mosaic():
    width = (X1 - X0 + 1) * 256
    height = (Y1 - Y0 + 1) * 256
    mosaic = np.zeros((height, width), dtype=np.float32)
    for x in range(X0, X1 + 1):
        for y in range(Y0, Y1 + 1):
            rgb = np.asarray(Image.open(tile_path(x, y)).convert('RGB')).astype(np.float64)
            elevation = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
            mosaic[(y - Y0) * 256:(y - Y0 + 1) * 256, (x - X0) * 256:(x - X0 + 1) * 256] = elevation
    return mosaic


def pixel(lat, lon):
    fx = (lon + 180) / 360 * N
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N
    return (fx - X0) * 256 - 0.5, (fy - Y0) * 256 - 0.5


def elevation(mosaic, lat, lon):
    x, y = pixel(lat, lon)
    i, j = int(math.floor(x)), int(math.floor(y))
    dx, dy = x - i, y - j
    h, w = mosaic.shape
    if i < 0 or j < 0 or i + 1 >= w or j + 1 >= h:
        return float('nan')
    a, b = mosaic[j, i], mosaic[j, i + 1]
    c, d = mosaic[j + 1, i], mosaic[j + 1, i + 1]
    return float(a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy)


def destination(lat, lon, bearing, distance):
    p1, l1, t = math.radians(lat), math.radians(lon), math.radians(bearing)
    dr = distance / R
    p2 = math.asin(math.sin(p1) * math.cos(dr) + math.cos(p1) * math.sin(dr) * math.cos(t))
    l2 = l1 + math.atan2(math.sin(t) * math.sin(dr) * math.cos(p1), math.cos(dr) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), math.degrees(l2)


def scene_to_latlon(x, z):
    distance = math.hypot(x, z)
    if distance < 1e-6:
        return LAT0, LON0
    bearing = math.degrees(math.atan2(x, z)) % 360
    return destination(LAT0, LON0, bearing, distance)


def angle(height_asl, distance):
    drop = 0.0675 * (distance / 1000) ** 2
    return math.degrees(math.atan2(height_asl - EYE_ASL - drop, distance))


# --- the terrain grid -------------------------------------------------------------

def build_terrain(mosaic):
    count = 2 * GRID_HALF // GRID_STEP + 1
    heights = []
    for iz in range(count):
        z = -GRID_HALF + iz * GRID_STEP
        for ix in range(count):
            x = -GRID_HALF + ix * GRID_STEP
            lat, lon = scene_to_latlon(x, z)
            asl = elevation(mosaic, lat, lon)
            # A 3x3 median over the SRTM speckle, sampled half a step apart.
            samples = []
            for ox in (-0.5, 0, 0.5):
                for oz in (-0.5, 0, 0.5):
                    la, lo = scene_to_latlon(x + ox * GRID_STEP, z + oz * GRID_STEP)
                    samples.append(elevation(mosaic, la, lo))
            asl = float(np.median([s for s in samples if s == s] or [asl]))
            heights.append(round(asl + SCENE_OFFSET, 1))
    return {'x0': -GRID_HALF, 'z0': -GRID_HALF, 'step': GRID_STEP, 'nx': count, 'nz': count, 'heights': heights}


# --- the horizon ribbons -----------------------------------------------------------

# Each ribbon is the highest skyline point within a band of real distance,
# drawn at a stand-in distance D inside the sky dome at the same angular
# height. `tone` picks its colour and how much haze it wears.
RIBBONS = [
    # id, from, to (bearing), nearest, farthest (m), D, tone
    ('korazim-eremos-slope', 244, 406, 850, 4000, 900, 'near'),
    ('korazim-east-shoulder', 10, 46, 4000, 8000, 1000, 'near'),
    ('arbel-nitai', 214, 247, 7500, 11500, 1100, 'limestone'),
    ('bethsaida-escarpment', 44, 66, 8000, 13000, 1150, 'golan'),
    ('hippos-mesa', 142, 150, 12000, 15000, 1200, 'golan'),
    ('golan-escarpment', 64, 168, 8000, 21000, 1250, 'golan'),
    ('tiberias-hills', 182, 216, 11000, 25000, 1250, 'far'),
    ('hattin-lower-galilee', 228, 262, 11000, 25000, 1250, 'far'),
    ('golan-interior', 40, 66, 21000, 40000, 1350, 'far'),
    ('gilead', 164, 178, 40000, 80000, 1380, 'faint'),
]


def skyline(mosaic, bearing, nearest, farthest):
    best = None
    distance = nearest
    while distance <= farthest:
        lat, lon = destination(LAT0, LON0, bearing, distance)
        asl = elevation(mosaic, lat, lon)
        if asl == asl:
            a = angle(asl, distance)
            if best is None or a > best[0]:
                best = (a, distance)
        distance += 20 if distance < 4000 else (40 if distance < 15000 else (100 if distance < 40000 else 200))
    return best


def build_horizon(mosaic):
    ribbons = []
    for rid, start, end, nearest, farthest, D, tone in RIBBONS:
        points = []
        for b in range(start, end + 1):
            bearing = b % 360
            found = skyline(mosaic, bearing, nearest, farthest)
            if not found:
                continue
            alpha, real = found
            y_top = EYE_Y + D * math.tan(math.radians(alpha))
            # [bearing, top of the silhouette in scene metres, real distance in km]
            points.append([bearing, round(y_top, 2), round(real / 1000, 2)])
        ribbons.append({'id': rid, 'D': D, 'tone': tone, 'points': points})
    return ribbons


HEADER = """// Generated by scripts/build-capernaum-landscape.py — do not edit by hand.
//
// {what}
//
// Source: SRTM-derived AWS Terrain Tiles (terrarium encoding, zoom 12, about
// 32 m a pixel). Scene y = height above sea level + 208.85, so the village
// ground is 0 and the lake at its first-century level (-210 m) is -1.15.
// +X east, +Z north, metres from the village at 32.8806 N, 35.5752 E.
"""


def main():
    fetch_tiles()
    mosaic = load_mosaic()
    terrain = build_terrain(mosaic)
    with open(OUT_TERRAIN, 'w') as f:
        f.write(HEADER.format(what='The ground around the village: a square height grid, row by row from the\n// south-west corner (z0 first, x varying fastest).'))
        f.write('export const TERRAIN = ')
        f.write(json.dumps({k: v for k, v in terrain.items() if k != 'heights'})[:-1])
        f.write(', heights: [')
        f.write(','.join(f'{h:g}' for h in terrain['heights']))
        f.write(']};\n')
    horizon = build_horizon(mosaic)
    with open(OUT_HORIZON, 'w') as f:
        f.write(HEADER.format(what='The far skyline, as ribbons at true bearings and true angular heights. Each\n// point is [compass bearing, silhouette top in scene metres at the ribbon\'s\n// stand-in distance D, real distance of that skyline in km]. Hermon, Tabor,\n// Meron and Chorazin are hidden from here by nearer ground and so are absent.'))
        f.write('export const HORIZON_RIBBONS = ')
        f.write(json.dumps(horizon, separators=(',', ':')))
        f.write(';\n')
    print('terrain', terrain['nx'], 'x', terrain['nz'], 'at', GRID_STEP, 'm;', os.path.getsize(OUT_TERRAIN), 'bytes')
    print('horizon', sum(len(r['points']) for r in horizon), 'points;', os.path.getsize(OUT_HORIZON), 'bytes')
    # Spot checks against the geography notes.
    def at(x, z):
        i = (z + GRID_HALF) // GRID_STEP * terrain['nx'] + (x + GRID_HALF) // GRID_STEP
        return terrain['heights'][int(i)]
    print('spot heights (0,240)', at(0, 240), '(0,750)', at(0, 750), '(-900,0)', at(-900, 0), '(0,-300)', at(0, -300))


if __name__ == '__main__':
    main()
