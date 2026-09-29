#!/usr/bin/env python3
"""Bakes the Mount of Olives from real elevation data.

Writes three small committed modules:

  src/components/scene/olivetTerrainData.js
      A height grid, in scene metres, within about 1.2 km of Gethsemane: the
      Kidron valley at its foot, the western slope up to the summit ridge, and
      across the Kidron the east face of the Temple Mount and the city.

  src/components/scene/olivetGroundData.js
      The same grid cut down to the ground a visitor can walk on, for the
      navigation module, which the scene route loads before any builder and
      so should not carry the whole kilometre. Same step, same origin, so its
      triangles are the same triangles.

  src/components/scene/olivetHorizonData.js
      The far skyline as ribbons at true compass bearings and true angular
      heights: west, the hills beyond the city; east, over the ridge, the
      Judean desert falling to the Dead Sea and the Moab plateau behind it.

Source: SRTM-derived elevation tiles, AWS Terrain Tiles ("terrarium"
encoding) at zoom 13, about 16 m a pixel (SRTM's own resolution is about
30 m; the finer tiles only interpolate), fetched from
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png into the
ignored cache scripts/.cache/olivet-dem/ (downloaded on first run). The model
is of the modern surface: the modern city and roads are in it at SRTM's
resolution, which is why the builder flattens the Temple Mount's footprint to
its platform and draws the first-century city over the western hill.

Scene conventions: origin at Gethsemane (31.7797 N, 35.2398 E: the rock
the Church of All Nations is built round), +X east, -Z north, metres. That is
the right-handed way round (facing north, east is on your right), which
matters in a scene whose content is a view: +Z north would mirror it. Scene y = height above sea level less the ground at the
origin, so Gethsemane's ground is 0. Horizon angles are taken from an eye on
the middle of the slope, with curvature and refraction as a drop of
0.0675 d_km^2 metres.

Usage:  python3 scripts/build-olivet-landscape.py
"""

import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.cache', 'olivet-dem')
OUT_TERRAIN = os.path.join(ROOT, 'src', 'components', 'scene', 'olivetTerrainData.js')
OUT_HORIZON = os.path.join(ROOT, 'src', 'components', 'scene', 'olivetHorizonData.js')
OUT_GROUND = os.path.join(ROOT, 'src', 'components', 'scene', 'olivetGroundData.js')

LAT0, LON0 = 31.7797, 35.2398
R = 6371008.8

# Local terrain: zoom 13 tiles around the origin.
ZOOM = 13
# Far skyline: zoom 10 tiles out to about 45 km (Moab).
FAR_ZOOM = 10
FAR_RADIUS = 48000

GRID_HALF = 1200
GRID_STEP = 15
# The walkable ground (olivetGroundData.js): x0, x1, z0, z1 on the grid's own
# points, from the Kidron's west bank to past the summit.
WALK = (-165, 660, -300, 480)
# The eyes the far skyline is measured from. The west is seen from the whole
# western slope, so from the middle of it; the east only from the top, so
# from there. Heights are written relative to the eye (D tan a), and the
# builder carries the ribbons at the camera's own height.
EYES = {'slope': (180, 0), 'summit': (520, 40)}
EYE_ABOVE = 1.7


def tile_range(zoom, lat_min, lat_max, lon_min, lon_max):
    n = 2 ** zoom
    def tx(lon):
        return int((lon + 180) / 360 * n)
    def ty(lat):
        return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return tx(lon_min), tx(lon_max), ty(lat_max), ty(lat_min)


def tile_path(zoom, x, y):
    return os.path.join(CACHE, f'z{zoom}_{x}_{y}.png')


def fetch(zoom, bounds):
    os.makedirs(CACHE, exist_ok=True)
    x0, x1, y0, y1 = bounds
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            path = tile_path(zoom, x, y)
            if os.path.exists(path):
                continue
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png'
            print('fetching', url)
            urllib.request.urlretrieve(url, path)


class Mosaic:
    def __init__(self, zoom, bounds):
        self.zoom = zoom
        self.x0, self.x1, self.y0, self.y1 = bounds
        width = (self.x1 - self.x0 + 1) * 256
        height = (self.y1 - self.y0 + 1) * 256
        self.data = np.zeros((height, width), dtype=np.float32)
        for x in range(self.x0, self.x1 + 1):
            for y in range(self.y0, self.y1 + 1):
                rgb = np.asarray(Image.open(tile_path(zoom, x, y)).convert('RGB')).astype(np.float64)
                elevation = rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256 - 32768
                self.data[(y - self.y0) * 256:(y - self.y0 + 1) * 256, (x - self.x0) * 256:(x - self.x0 + 1) * 256] = elevation

    def at(self, lat, lon):
        n = 2 ** self.zoom
        fx = (lon + 180) / 360 * n
        fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
        x = (fx - self.x0) * 256 - 0.5
        y = (fy - self.y0) * 256 - 0.5
        i, j = int(math.floor(x)), int(math.floor(y))
        dx, dy = x - i, y - j
        h, w = self.data.shape
        if i < 0 or j < 0 or i + 1 >= w or j + 1 >= h:
            return float('nan')
        a, b = self.data[j, i], self.data[j, i + 1]
        c, d = self.data[j + 1, i], self.data[j + 1, i + 1]
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
    # +X east, -Z north.
    bearing = math.degrees(math.atan2(x, -z)) % 360
    return destination(LAT0, LON0, bearing, distance)


def build_terrain(mosaic, ground):
    count = 2 * GRID_HALF // GRID_STEP + 1
    heights = []
    for iz in range(count):
        z = -GRID_HALF + iz * GRID_STEP
        for ix in range(count):
            x = -GRID_HALF + ix * GRID_STEP
            samples = []
            for ox in (-0.5, 0, 0.5):
                for oz in (-0.5, 0, 0.5):
                    la, lo = scene_to_latlon(x + ox * GRID_STEP, z + oz * GRID_STEP)
                    samples.append(mosaic.at(la, lo))
            asl = float(np.median([s for s in samples if s == s]))
            heights.append(round(asl - ground, 1))
    return {'x0': -GRID_HALF, 'z0': -GRID_HALF, 'step': GRID_STEP, 'nx': count, 'nz': count, 'heights': heights}


# id, from, to (bearing), nearest, farthest (m), D, tone, eye
RIBBONS = [
    ('west-hills', 200, 340, 1300, 9000, 1500, 'near', 'slope'),
    ('nebi-samwil', 318, 340, 5000, 9000, 1550, 'far', 'slope'),
    ('north-ridge', 340, 380, 1300, 9000, 1500, 'near', 'slope'),
    ('judean-desert', 20, 200, 1300, 16000, 1500, 'desert', 'summit'),
    ('moab', 40, 150, 16000, 48000, 1650, 'faint', 'summit'),
]


def skyline(mosaic, eye_lat, eye_lon, eye_asl, bearing, nearest, farthest):
    best = None
    distance = nearest
    while distance <= farthest:
        lat, lon = destination(eye_lat, eye_lon, bearing, distance)
        asl = mosaic.at(lat, lon)
        if asl == asl:
            drop = 0.0675 * (distance / 1000) ** 2
            a = math.degrees(math.atan2(asl - eye_asl - drop, distance))
            if best is None or a > best[0]:
                best = (a, distance)
        distance += 25 if distance < 5000 else (60 if distance < 16000 else 150)
    return best


def build_horizon(mosaic, near):
    ribbons = []
    for rid, start, end, nearest, farthest, D, tone, eye in RIBBONS:
        eye_lat, eye_lon = scene_to_latlon(*EYES[eye])
        eye_asl = near.at(eye_lat, eye_lon) + EYE_ABOVE
        points = []
        for b in range(start, end + 1):
            found = skyline(mosaic, eye_lat, eye_lon, eye_asl, b % 360, nearest, farthest)
            if not found:
                continue
            alpha, real = found
            points.append([b % 360, round(D * math.tan(math.radians(alpha)), 2), round(real / 1000, 2)])
        ribbons.append({'id': rid, 'D': D, 'tone': tone, 'eye': eye, 'points': points})
    return ribbons


# The Dead Sea from the summit: for each bearing, the band of water that
# shows between the desert's own skyline and the far shore, if any does. Its
# surface was about -411 m in the SRTM year; anything under SEA_BELOW is water.
SEA_BELOW = -395
SEA_D = 1600


def sea_band(mosaic, eye_lat, eye_lon, eye_asl, bearing):
    blocked = -90.0
    near = None
    far = None
    distance = 1300
    while distance <= 48000:
        lat, lon = destination(eye_lat, eye_lon, bearing, distance)
        asl = mosaic.at(lat, lon)
        if asl == asl:
            drop = 0.0675 * (distance / 1000) ** 2
            if asl < SEA_BELOW:
                a = math.degrees(math.atan2(SEA_BELOW - 16 - eye_asl - drop, distance))
                if near is None:
                    near = (max(a, blocked), distance)
                far = (a, distance)
            elif near is None:
                blocked = max(blocked, math.degrees(math.atan2(asl - eye_asl - drop, distance)))
            else:
                break
        distance += 60 if distance < 16000 else 150
    if near is None or far[0] <= near[0]:
        return None
    return near, far


def build_sea(mosaic, near_mosaic):
    eye_lat, eye_lon = scene_to_latlon(*EYES['summit'])
    eye_asl = near_mosaic.at(eye_lat, eye_lon) + EYE_ABOVE
    points = []
    for b in range(60, 181):
        band = sea_band(mosaic, eye_lat, eye_lon, eye_asl, b)
        if not band:
            continue
        (a_near, d_near), (a_far, d_far) = band
        points.append([b, round(SEA_D * math.tan(math.radians(a_far)), 2), round(d_far / 1000, 2),
                       round(SEA_D * math.tan(math.radians(a_near)), 2)])
    return {'id': 'dead-sea', 'D': SEA_D, 'tone': 'sea', 'eye': 'summit', 'points': points}


HEADER = """// Generated by scripts/build-olivet-landscape.py — do not edit by hand.
//
// {what}
//
// Source: SRTM-derived AWS Terrain Tiles (terrarium encoding). Scene y =
// height above sea level less {ground:g} m, the ground at Gethsemane, so the
// origin's ground is 0. +X east, -Z north, metres from 31.7797 N, 35.2398 E.
"""


def main():
    near_bounds = tile_range(ZOOM, LAT0 - 0.02, LAT0 + 0.02, LON0 - 0.025, LON0 + 0.025)
    fetch(ZOOM, near_bounds)
    near = Mosaic(ZOOM, near_bounds)
    ground = near.at(LAT0, LON0)
    terrain = build_terrain(near, ground)

    deg_lat = FAR_RADIUS / 111320
    deg_lon = FAR_RADIUS / (111320 * math.cos(math.radians(LAT0)))
    far_bounds = tile_range(FAR_ZOOM, LAT0 - deg_lat, LAT0 + deg_lat, LON0 - deg_lon, LON0 + deg_lon)
    fetch(FAR_ZOOM, far_bounds)
    far = Mosaic(FAR_ZOOM, far_bounds)

    horizon = build_horizon(far, near)
    sea = build_sea(far, near)
    if sea['points']:
        horizon.append(sea)

    with open(OUT_TERRAIN, 'w') as f:
        f.write(HEADER.format(ground=round(ground, 1), what='The ground around Gethsemane: a square height grid, row by row from the\n// south-west corner (z0 first, x varying fastest).'))
        f.write('export const OLIVET_GROUND_ASL = ' + f'{round(ground, 1):g}' + ';\n')
        f.write('export const TERRAIN = ')
        f.write(json.dumps({k: v for k, v in terrain.items() if k != 'heights'})[:-1])
        f.write(', heights: [')
        f.write(','.join(f'{h:g}' for h in terrain['heights']))
        f.write(']};\n')
    wx0, wx1, wz0, wz1 = WALK
    ix0, ix1 = (wx0 + GRID_HALF) // GRID_STEP, (wx1 + GRID_HALF) // GRID_STEP
    iz0, iz1 = (wz0 + GRID_HALF) // GRID_STEP, (wz1 + GRID_HALF) // GRID_STEP
    ground_heights = [terrain['heights'][j * terrain['nx'] + i] for j in range(iz0, iz1 + 1) for i in range(ix0, ix1 + 1)]
    with open(OUT_GROUND, 'w') as f:
        f.write(HEADER.format(ground=round(ground, 1), what='The walkable part of olivetTerrainData.js, for the navigation: the same\n// samples on the same points, so the same triangles. A test holds the two\n// together.'))
        f.write('export const GROUND = ')
        f.write(json.dumps({'x0': wx0, 'z0': wz0, 'step': GRID_STEP, 'nx': ix1 - ix0 + 1, 'nz': iz1 - iz0 + 1})[:-1])
        f.write(', heights: [')
        f.write(','.join(f'{h:g}' for h in ground_heights))
        f.write(']};\n')
    with open(OUT_HORIZON, 'w') as f:
        f.write(HEADER.format(ground=round(ground, 1), what='The far skyline, as ribbons at true bearings and true angular heights. Each\n// point is [compass bearing, silhouette top in metres above the eye at the\n// ribbon\'s stand-in distance D, real distance of that skyline in km], and for the\n// Dead Sea a fourth value, the height its near edge shows at. Heights\n// are relative: the builder carries the ribbons at the camera\'s height.'))
        f.write('export const HORIZON_RIBBONS = ')
        f.write(json.dumps(horizon, separators=(',', ':')))
        f.write(';\n')

    def at(x, z):
        i = round((z + GRID_HALF) / GRID_STEP) * terrain['nx'] + round((x + GRID_HALF) / GRID_STEP)
        return terrain['heights'][int(i)]
    print('ground at Gethsemane', round(ground, 1), 'm ASL')
    for r in horizon:
        tops = [p[1] for p in r['points']]
        print(f"  ribbon {r['id']:14s} {len(tops)} points, rise {min(tops):.1f}..{max(tops):.1f} m at D={r['D']}")
    print('terrain', terrain['nx'], 'x', terrain['nz'], 'at', GRID_STEP, 'm;', os.path.getsize(OUT_TERRAIN), 'bytes')
    print('horizon', sum(len(r['points']) for r in horizon), 'points;', os.path.getsize(OUT_HORIZON), 'bytes')
    for label, x, z in [('kidron below', -90, 0), ('dome of the rock', -430, 185), ('golden gate (outside)', -200, 121),
                        ('dominus flevit', 100, 190), ('summit (ascension)', 463, 71), ('absalom pillar', -120, 330)]:
        print(f'  {label:26s} ({x},{z}) y={at(x, z)}')


if __name__ == '__main__':
    main()
