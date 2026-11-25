# PBI 255 — asset catalog: buildings and street furniture

Collected 2026-11-25 for [PBI 255](../../../PBI/To%20Do/255-building-and-furniture-models.md). Every file below exists in the working tree, was downloaded from the public Innerscene library, and was inspected with the checked-in scripts.

Source: Innerscene Free Parts Library — <https://www.innerscene.com/tools/library/3d-parts>
All parts on that library are published under **CC0 1.0 Universal (Public Domain Dedication)**, <https://creativecommons.org/publicdomain/zero/1.0/>.

## Licence record

Every GLB downloaded here carries the same verbatim copyright string in its glTF `asset` block:

> Authored by Innerscene Corp (innerscene.com). Public domain: dedicated under CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/. Free to use, modify and redistribute for any purpose, with no credit required.

The part pages expose the same licence as metadata:

- `license: "CC0-1.0"`
- `sourceName: "Innerscene - original model"`
- `sourceUrl: "https://www.innerscene.com/"`

The library landing page states: “Everything is public domain (CC0)” with a link to the CC0 1.0 deed. No login, payment, or attribution is required for these downloads.

## Verification method

- Files were fetched with `curl -L` from the public download route `https://www.innerscene.com/api/library/<part-id>/download`, which redirects to `files.innerscene.com`. No account, cookie, or token was used.
- `node scripts/inspect-glb.mjs` — raw output saved in [inspect-glb.txt](inspect-glb.txt). The script ignores arguments and walks `public/assets/models`; the new files were already in place when it ran, so every row below appears in that log.
- Node/transform dump — saved in [inspect-glb-nodes.txt](inspect-glb-nodes.txt). **Caveat:** the checked-in `scripts/inspect-glb-nodes.mjs` hard-codes `taxi.glb` and `sedan.glb` and does not read `<path>` arguments, so the log was produced with a temporary byte-identical copy of its node-walk that accepts file paths. No project file was modified.
- `gltf-transform validate` (4.5.1, from `node_modules/.bin`) — zero errors for all 11 files. Nine files are warning-free. The two sign files each emit `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings (3 on `stop-sign.glb`, 2 on `street-name-sign.glb`): their normal maps rely on runtime-generated tangents. This is a portability warning, not a load failure; the models have no explicit `TANGENT` attribute.
- `gltf-transform inspect`-style checks were done directly on the GLB JSON: zero `extensionsRequired`, zero external `buffer`/`image` URIs, zero animations, zero skins.
- Byte sizes below are `Get-Item.Length` on disk, not the `size` metadata declared on the source page.

## Catalog

Sizes are the inspector's `bounds size` in metres, presented as **H x W x D** (Y x X x Z). “Forward” means the side the entry door / storefront / opening faces. “Origin” is the GLB origin relative to the model; `y=0` was verified from `bounds min` for every file.

| File | Bytes | H x W x D (m) | Forward | Origin | Tris | Embedded textures | Licence | Source page |
| --- | ---: | --- | --- | --- | ---: | ---: | --- | --- |
| `public/assets/models/buildings/house-small.glb` | 22,524 | 4.80 x 4.40 x 4.40 | +Z | ground centre (x=0, z=0, y=0) | 152 | 1,439 B / 6 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-house-building-low-77087adb |
| `public/assets/models/buildings/house-medium.glb` | 39,816 | 7.80 x 4.40 x 4.40 | +Z | ground centre | 296 | 1,439 B / 6 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-house-building-medium-30234432 |
| `public/assets/models/buildings/house-tall.glb` | 57,136 | 10.80 x 4.40 x 4.40 | +Z | ground centre | 440 | 1,439 B / 6 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-house-building-tall-3b161b3a |
| `public/assets/models/buildings/apartment-medium.glb` | 47,408 | 6.24 x 6.20 x 5.20 | +Z | ground centre of wall volume | 372 | 958 B / 4 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-apartment-building-medium-a7d55480 |
| `public/assets/models/buildings/apartment-tall.glb` | 73,428 | 9.24 x 6.20 x 5.20 | +Z | ground centre of wall volume | 588 | 958 B / 4 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-apartment-building-tall-a3dc8263 |
| `public/assets/models/buildings/shop-tall.glb` | 66,480 | 9.24 x 4.20 x 4.96 | +Z | ground centre of wall volume | 516 | 1,680 B / 7 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-shop-building-tall-316670f9 |
| `public/assets/models/decor/fire-hydrant.glb` | 19,048 | 0.94 x 0.56 x 0.44 | none (radial) | ground centre | 196 | 479 B / 2 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-hydrant-f8c0a817 |
| `public/assets/models/decor/trash-can.glb` | 9,740 | 0.94 x 0.68 x 0.65 | +Z | ground centre | 84 | 720 B / 3 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-bin-12f8624d |
| `public/assets/models/decor/bus-shelter.glb` | 30,560 | 2.71 x 3.83 x 1.70 | +Z (open side) | ground centre of shelter, x offset by attached sign | 228 | 959 B / 4 PNG | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/low-poly-city-bus-stop-9362e786 |
| `public/assets/models/decor/street-name-sign.glb` | 1,714,324 | 3.29 x 0.90 x 0.90 | crossed blades, no single front | base of post | 412 | 1,691,387 B / 5 images | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/street-name-sign-0e9fbcae |
| `public/assets/models/decor/stop-sign.glb` | 2,592,000 | 2.85 x 0.75 x 0.09 | ±Z (double-sided sign face) | base of post | 436 | 2,565,913 B / 7 images | CC0-1.0 | https://www.innerscene.com/tools/library/3d-parts/stop-sign-c05db2e6 |

All eleven files: glTF 2.0 binary, `animations=0`, `skins=0`, one embedded BIN buffer, no external URIs, no `extensionsRequired`, and an empty `extensionsUsed` after the sign cleanup described below.

## Model notes

### `house-small.glb` — Low-poly City - House building low

- Nodes (14): `Building wall volume 001`, `Plinth 002`, `Chimney 013`, `Entry door 011`, `Pitched roof 012`, four `Window blue glazing 004/006/008/010`, four `Window trim 003/005/007/009`, root `Low-poly City - House building low`.
- Entry door at `z = 2.00...2.09`, so the front facade faces **+Z**. Windows are on both ±Z facades, so rotating 180° also gives a valid back facade.
- Wall volume is 4.0 x 4.0 x 3.0 m; roof and plinth expand the bbox to 4.4 x 4.4. Origin is at ground level, centred on the footprint.
- 152 triangles; the lowest-poly building in the set. Suitable for the 3.8–4.8 m lots.

### `house-medium.glb` — Low-poly City - House building medium

- Pre-existing PBI 254 asset, re-downloaded byte-for-byte from the same source URL and re-inspected here. It was left untouched.
- Nodes (26): `Building wall volume 001`, `Plinth 002`, `Chimney 025`, `Entry door 023`, `Pitched roof 024`, ten `Window blue glazing`, ten `Window trim`, root `Low-poly City - House building medium`.
- Front facade faces **+Z** (door at `z = 2.00...2.09`). Origin at ground centre. 296 triangles.
- Same 4.4 x 4.4 m footprint as `house-small`, but 7.8 m tall.

### `house-tall.glb` — Low-poly City - House building tall

- Nodes (38): `Building wall volume 001`, `Plinth 002`, `Chimney 037`, `Entry door 035`, `Pitched roof 036`, 16 `Window blue glazing`, 16 `Window trim`, root `Low-poly City - House building tall`.
- Front **+Z**, origin at ground centre, 440 triangles.
- 10.8 m tall on the same 4.4 x 4.4 m footprint: the four-storey end of the 1–4 storey range. Still short of the 13.4 m maximum lot height, so the tallest lots would need a documented vertical scale or a different massing.

### `apartment-medium.glb` — Low-poly City - Apartment building medium

- Nodes (32): `Building wall volume 001`, `Plinth 002`, `Ground entrance porch 011`, `Entry door 030`, `Flat roof coping 031`, `Balcony deck 023`, `Balcony door 016`, three `Balcony rail picket`, two `Balcony return rail`, `Balcony top rail 027`, nine `Window blue glazing`, nine `Window trim`, root `Low-poly City - Apartment building medium`.
- Entry door and ground porch at `z = +2.0...3.1`, balcony at `z = +2.0...3.1`: front **+Z**.
- **Origin caveat:** bbox `z` is −2.10…+3.10, but the wall volume is only `z = −2…+2` (6.0 x 4.0 m). The extra metre is the balcony/porch overhang, which matters for lot depth and facade alignment. Placement should use the wall footprint, not the bbox.
- 372 triangles, two storeys (6.24 m).

### `apartment-tall.glb` — Low-poly City - Apartment building tall

- Nodes (50): same set as the medium apartment plus a second balcony storey — two `Balcony deck`, two `Balcony door`, six `Balcony rail picket`, four `Balcony return rail`, two `Balcony top rail`, `Building wall volume 001`, `Plinth 002`, `Ground entrance porch 011`, `Entry door 048`, `Flat roof coping 049`, 14 `Window blue glazing`, 14 `Window trim`, root `Low-poly City - Apartment building tall`.
- Front **+Z**; same balcony overhang caveat (wall 6.0 x 4.0 m, bbox depth 5.20 m).
- 588 triangles, three storeys (9.24 m): the 3–4 storey block typology.

### `shop-tall.glb` — Low-poly City - Shop building tall

- Nodes (44): `Building wall volume 001`, `Plinth 002`, `Entry door 035`, `Flat roof coping 036`, `Shop awning 037`, five `Striped awning edge 038–042`, `Blank storefront sign 043`, 16 `Window blue glazing`, 16 `Window trim`, root `Low-poly City - Shop building tall`.
- Storefront, door and awning at `z = +2`, front **+Z**. The awning projects to `z = +2.83`, so the bbox depth is 4.96 m while the wall volume is 4.0 m deep; align facades from the wall, not the awning.
- 516 triangles, three storeys (9.24 m). This is a single-facade commercial block, not a dedicated two-facade corner piece; on a corner lot it can be rotated, but the side walls are plain.

### `fire-hydrant.glb` — Low-poly City - Hydrant

- Nodes (7): `Hydrant base 001`, `Hydrant body 002`, `Hydrant cap 003`, `Hose outlet 004`, `Hose outlet 005`, `Top operating nut 006`, root `Low-poly City - Hydrant`.
- Radially symmetric body with hose outlets on ±X, so no meaningful forward axis. Origin at the base centre, height 0.94 m (a plausible real hydrant).
- 196 triangles. Only 479 B of embedded texture: almost all of the 19 KB is geometry.

### `trash-can.glb` — Low-poly City - Bin

- Nodes (4): `Bin body 001`, `Bin lid 002`, `Waste opening 003`, root `Low-poly City - Bin`.
- The waste opening is on `z = +0.29...0.31`, so the front is **+Z**; rotate it to face the footway. Origin at base centre, 0.94 m tall.
- 84 triangles, 720 B of textures.

### `bus-shelter.glb` — Low-poly City - Bus stop

- Nodes (20): `Shelter column 001/002`, `Shelter canopy 003`, `Back screen 004`, `Seat plank 005/006/007`, `Seat crossbearer 008/012`, `Bench leg 009/010/013/014`, `Back support 011/015`, `Backrest plank 016/017`, `Stop sign post 018`, `Unlettered stop sign 019`, root `Low-poly City - Bus stop`.
- Back screen at `z ≈ −0.55`, bench faces **+Z**: the open side is +Z.
- **Origin caveat:** the model includes a small stop-sign post bolted to the left end (`x = −1.93...−1.67`), which makes the bbox 3.83 m wide and off-centre (`x = −2.125...1.700`). The shelter proper is 3.40 m wide (`x = −1.70...1.70`). If the sign is unwanted it is a separate node and can be hidden or stripped without touching the shelter.
- 228 triangles, 2.71 m tall, 1.70 m deep.

### `street-name-sign.glb` — Street name sign

- Nodes (2): one mesh node `Street name sign assembly`, one root `Street name sign` (no child decomposition).
- Two crossed double-sided name blades on a galvanised post; bbox 0.90 x 0.90 x 3.29 m, origin at the post base. There is no single front: one blade lies along X and the other along Z, so both ±X and ±Z are “readable” from some angle.
- 412 triangles, but **1.69 MB of embedded textures** (five images, four JPEG up to 565 KB plus one PNG face texture). This is the heaviest furniture file after the stop sign; it needs texture resizing before it can fit an asset budget.
- The source GLB declared `KHR_materials_specular` on the retroreflective face material. That optional declaration (`specularColorFactor: [1.2, 1.2, 1.2]`) was removed, leaving core glTF 2.0 with no visual texture or geometry change.
- `gltf-transform validate` reports no errors but two `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings: the normal-mapped primitives have no `TANGENT` attribute, so tangents are generated at runtime. Babylon.js does this by default, but it is not portable across every glTF loader.

### `stop-sign.glb` — Stop sign

- Nodes (2): one mesh node `Stop sign assembly`, one root `Stop sign`.
- Octagonal STOP blank 0.75 m across flats on a galvanised post, 2.85 m overall, origin at post base. The blank is thin in Z (`−0.036...0.055`) and its face material is double-sided, so the sign reads along both ±Z.
- 436 triangles, **2.57 MB of embedded textures** (seven images: aluminium and galvanised base/normal maps, paint grain, and the STOP face). Same optimisation caveat as the street name sign.
- Same `KHR_materials_specular` removal as above; the file shrank from 2,592,168 to 2,592,000 bytes.
- `gltf-transform validate` reports no errors but three `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings (same missing-`TANGENT` issue as the street name sign).

## Pieces not found

- **Parking meter** — no CC0 GLB found.
  - Innerscene: searched the 13,842-entry library sitemap (3D parts plus drawings) for “parking meter”, “parking”, “meter”, “pay and display”, “ticket machine”, “kiosk”. Only `parking-wheel-stop-14cf43aa` and unrelated kiosks exist; no parking meter.
  - Poly Pizza: the only “Parking Meter” is <https://poly.pizza/m/SIePMtqLF8> by Zsky, licensed **CC BY 3.0**, not CC0. Rejected.
  - BlendSwap has a **CC0** parking meter (<https://blendswap.com/blend/7714>) but only as a Blender 2.6 `.blend`; Blender is not installed in this environment, so it cannot be converted to GLB and metre-checked here. Not downloaded.
  - vinish.dev has a parking meter in a CC BY 4.0 street-prop pack; rejected for the same licence reason.
  - Result: PBI 255 still needs a CC0 parking-meter GLB, or an explicit decision to keep the procedural parking meter for that one prop.

## Not done here

- No entry was added to `src/rendering/babylon/glb-assets.ts` or the 150 manifest; that registration is PBI 255 implementation work.
- No textures were resized and no geometry was simplified. The two signs are 1.7 MB and 2.6 MB because of their original texture sets; they are complete and valid, but will need optimisation before they meet the render/asset budgets.
- All files were left at their source scale in metres; no re-scale or re-origin was applied.
