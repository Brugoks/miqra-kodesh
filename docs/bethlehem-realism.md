# Bethlehem visual and daily-life pass

The village now uses locally hosted scanned surfaces, open olive foliage, framed plank doors and window shutters, exposed footing stones, lamp stands, and additional household storage. A daytime basket-maker works under a linen shade; the Village Workshop viewpoint makes the activity discoverable. The craft activity and animals are interpretive surroundings, separate from the biblical episode casts.

## Material provenance

All four sets are Poly Haven CC0 assets. They are surface references, not documentation of ancient Bethlehem:

- [White Plaster Rough 01](https://polyhaven.com/a/white_plaster_rough_01)
- [Dry Ground Rocks](https://polyhaven.com/a/dry_ground_rocks)
- [Weathered Brown Planks](https://polyhaven.com/a/weathered_brown_planks)
- [Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry)

Run `node scripts/prepare-bethlehem-materials.mjs` to reproduce the library. The script downloads the source diffuse, OpenGL normal and roughness maps, encodes 1024px WebP copies, and writes source URLs, byte sizes and SHA-256 prefixes to `bethlehemMaterialAssets.js`. The twelve maps total 3,498,368 bytes (3.34 MiB). Color maps use sRGB; normal and roughness maps use linear data. The runtime has no dependency on Poly Haven availability.

Surfaces project at metre scale, including scaled and instanced objects. Shader color adjustment keeps the scans within the village palette. Existing procedural surfaces remain if a color map fails; the asset session owns texture disposal. Materials load before character models for this scene only.

## Motion, sound and performance

- Olive foliage uses one instanced draw call: 240 eight-leaf sprays per tree on Low, 520 otherwise. The shadow pass uses the same wind displacement. Reduced motion freezes wind and animal movement.
- The existing instanced herd supports short walking/grazing routes and a shelter donkey. Two courtyard hens and the basket-maker are active in daylight. The artisan uses a fitted, authored hand pose to retain contact with the basket while weaving and pausing.
- The shelter's existing reflected lamplight is lowered toward the manger; every lamp has a visible support. No extra shadow-casting lights were added.
- Recorded wind is quieter globally and localized around two groves. The existing recorded fire and birds remain spatial; shelter enclosure continues to soften outdoor sound. Footstep levels are unchanged.
- Existing navigation heights and collision bounds remain authoritative. New workshop and animal routes are covered by navigation checks.

## Verification

Targeted Bethlehem/navigation, asset-session and audio tests, ESLint, asset validation, and the production build pass. Browser checks cover day/night views, the workshop, low quality and third-person viewing. Reduced motion and disposal are checked automatically. Physical-phone performance and a listening review on headphones remain unverified. The production build retains its existing large-chunk warnings.
