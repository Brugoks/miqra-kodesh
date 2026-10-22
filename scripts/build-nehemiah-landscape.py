#!/usr/bin/env python3
"""Bakes Nehemiah's Jerusalem from real elevation data.

Writes three small committed modules:

  src/components/scene/nehemiahTerrainData.js
      A height grid, in scene metres, within about 1.2 km of the Gihon spring:
      the City of David's ridge between the Kidron and the central valley, the
      Temple Mount at its head, the Hinnom wrapping its foot, the Mount of
      Olives across the Kidron.

  src/components/scene/nehemiahGroundData.js
      The same grid cut down to the ground a visitor can walk on, for the
      navigation module, which the scene route loads before any builder and so
      should not carry the whole kilometre. Same step, same origin, so its
      triangles are the same triangles.

  src/components/scene/nehemiahHorizonData.js
      The far skyline as ribbons at true compass bearings and true angular
      heights: west, the hills beyond the western ridge; east, over the Mount
      of Olives, the Judean desert and the wall of Moab.

Source: SRTM-derived elevation tiles, AWS Terrain Tiles ("terrarium"
encoding) at zoom 13, about 16 m a pixel (SRTM's own resolution is about 30 m;
the finer tiles only interpolate), fetched from
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png into the
ignored cache scripts/.cache/olivet-dem/ — the same cache the Mount of Olives
bake uses, because the two scenes look at the same hills from opposite sides
of the Kidron. The model is of the modern surface: the modern Silwan and the
Old City are in it at SRTM's resolution, and three thousand years of debris
fill the valleys that Nehemiah rode down, which is why the scene's own
nehemiahDimensions.js reshapes the ground before anything stands on it.

Scene conventions: origin at the Gihon spring (31.7739 N, 35.2367 E), +X east,
-Z north, metres — the right-handed way round (facing north, east is on your
right), like the Mount of Olives. Scene y = height above sea level less the
ground at the origin, so the spring's ground is 0. Horizon angles are taken
from an eye on the Ophel with curvature and refraction as a drop of
0.0675 d_km^2 metres.

Usage:  python3 scripts/build-nehemiah-landscape.py
"""

import json
import math
import os
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Shared with the Mount of Olives bake: the same tiles, fetched once.
CACHE = os.path.join(ROOT, 'scripts', '.cache', 'olivet-dem')
OUT_TERRAIN = os.path.join(ROOT, 'src', 'components', 'scene', 'nehemiahTerrainData.js')
OUT_HORIZON = os.path.join(ROOT, 'src', 'components', 'scene', 'nehemiahHorizonData.js')
OUT_GROUND = os.path.join(ROOT, 'src', 'components', 'scene', 'nehemiahGroundData.js')

LAT0, LON0 = 31.7739, 35.2367
R = 6371008.8

ZOOM = 13
FAR_ZOOM = 10
FAR_RADIUS = 48000

GRID_HALF = 1200
GRID_STEP = 12
# The walkable ground (nehemiahGroundData.js): x0, x1, z0, z1 on the grid's own
# points — the whole walled city and a margin of the slopes outside it.
WALK = (-612, 312, -756, 600)
# The eye the far skyline is measured from: on the Ophel, between the Temple
# and the city of David.
EYES = {'ophel': (-60, -170)}
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


# id, from, to (bearing), nearest, farthest (m), D, tone
RIBBONS = [
    ('west-hills', 200, 340, 1300, 9000, 1500, 'near'),
    ('nebi-samwil', 318, 340, 5000, 9000, 1550, 'far'),
    ('north-ridge', 340, 380, 1300, 9000, 1500, 'near'),
    ('judean-desert', 20, 200, 1300, 16000, 1500, 'desert'),
    ('moab', 40, 150, 16000, 48000, 1650, 'faint'),
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
    eye_lat, eye_lon = scene_to_latlon(*EYES['ophel'])
    eye_asl = near.at(eye_lat, eye_lon) + EYE_ABOVE
    for rid, start, end, nearest, farthest, D, tone in RIBBONS:
        points = []
        for b in range(start, end + 1):
            found = skyline(mosaic, eye_lat, eye_lon, eye_asl, b % 360, nearest, farthest)
            if not found:
                continue
            alpha, real = found
            points.append([b % 360, round(D * math.tan(math.radians(alpha)), 2), round(real / 1000, 2)])
        ribbons.append({'id': rid, 'D': D, 'tone': tone, 'eye': 'ophel', 'points': points})
    return ribbons


HEADER = """// Generated by scripts/build-nehemiah-landscape.py — do not edit by hand.
//
// {what}
//
// Source: SRTM-derived AWS Terrain Tiles (terrarium encoding). Scene y =
// height above sea level less {ground:g} m, the ground at the Gihon spring, so
// the origin's ground is 0. +X east, -Z north, metres from 31.7739 N, 35.2367 E.
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

    with open(OUT_TERRAIN, 'w') as f:
        f.write(HEADER.format(ground=round(ground, 1), what='The ground around the Gihon spring: a square height grid, row by row from the\n// south-west corner (z0 first, x varying fastest).'))
        f.write('export const NEHEMIAH_GROUND_ASL = ' + f'{round(ground, 1):g}' + ';\n')
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
        f.write(HEADER.format(ground=round(ground, 1), what='The walkable part of nehemiahTerrainData.js, for the navigation: the same\n// samples on the same points, so the same triangles. A test holds the two\n// together.'))
        f.write('export const GROUND = ')
        f.write(json.dumps({'x0': wx0, 'z0': wz0, 'step': GRID_STEP, 'nx': ix1 - ix0 + 1, 'nz': iz1 - iz0 + 1})[:-1])
        f.write(', heights: [')
        f.write(','.join(f'{h:g}' for h in ground_heights))
        f.write(']};\n')
    with open(OUT_HORIZON, 'w') as f:
        f.write(HEADER.format(ground=round(ground, 1), what='The far skyline, as ribbons at true bearings and true angular heights. Each\n// point is [compass bearing, silhouette top in metres above the eye at the\n// ribbon\'s stand-in distance D, real distance of that skyline in km]. Heights\n// are relative: the builder carries the ribbons at the camera\'s height.'))
        f.write('export const HORIZON_RIBBONS = ')
        f.write(json.dumps(horizon, separators=(',', ':')))
        f.write(';\n')

    def at(x, z):
        i = round((z + GRID_HALF) / GRID_STEP) * terrain['nx'] + round((x + GRID_HALF) / GRID_STEP)
        return terrain['heights'][int(i)]
    print('ground at the Gihon spring', round(ground, 1), 'm ASL')
    for r in horizon:
        tops = [p[1] for p in r['points']]
        print(f"  ribbon {r['id']:14s} {len(tops)} points, rise {min(tops):.1f}..{max(tops):.1f} m at D={r['D']}")
    print('terrain', terrain['nx'], 'x', terrain['nz'], 'at', GRID_STEP, 'm;', os.path.getsize(OUT_TERRAIN), 'bytes')
    print('ground ', ix1 - ix0 + 1, 'x', iz1 - iz0 + 1, ';', os.path.getsize(OUT_GROUND), 'bytes')
    print('horizon', sum(len(r['points']) for r in horizon), 'points;', os.path.getsize(OUT_HORIZON), 'bytes')
    # Landmarks to sanity-check against what is known of the ground.
    for label, la, lo in [
        ('Gihon spring', 31.7739, 35.2367),
        ('Pool of Siloam', 31.7706, 35.2350),
        ('Dome of the Rock (the rock)', 31.7780, 35.2354),
        ('En-rogel', 31.7678, 35.2344),
        ('Church of All Nations', 31.7797, 35.2398),
        ('Dung Gate', 31.7765, 35.2347),
    ]:
        asl = near.at(la, lo)
        # Back into scene metres, for the numbers the dimensions module wants.
        east = (lo - LON0) * 111320 * math.cos(math.radians(LAT0))
        north = (la - LAT0) * 110574
        print(f'  {label:28s} x={east:7.0f} z={-north:7.0f}  y={asl - ground:6.1f} (asl {asl:.0f})')


if __name__ == '__main__':
    main()
