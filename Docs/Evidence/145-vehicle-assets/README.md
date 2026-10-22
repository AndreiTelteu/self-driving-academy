# PBI 145 — asseturi auto: roți, lumini și LOD

Nivel de validare: `targeted` (politica 2026-10-08). Proba este o pagină de prezentare cu backendul
Babylon real, două clase vizuale și 24 de instanțe dinamice; nu conduce jocul și nu atinge starea
simulării.

## Ce s-a verificat

| Criteriu | Dovadă |
| --- | --- |
| Axele și roțile corespund configurației mecanice 023 | `vehicleVisualAlignment` = `[]`; pivoturi `x=±track/2`, `z=±wheelbase/2`, `y=-0,5` (connection −0,15 + rest 0,35), rază 0,32/0,29. Capturile `near.png`/`side.png`. |
| LOD nu schimbă colliderele sau `entityId` | Colliderul rămâne `cuboid(0.85, 0.3, 2)`; la 8 m/60 m/160 m `entityIdStable=true` și picking-ul întoarce `taxi:01` la toate cele trei niveluri. Roțile se ascund doar la `FAR` (`wheelMeshVisible=false`). |
| Manifest 223, materiale/LOD și prima utilizare pe instanțe dinamice | `budget.accepted=true` (vezi tabelul); prima utilizare măsurată pe instanțe noi, în scene cu 24 de vehicule. |

## Mediu și build

- Chrome 155.0.8059.85, headless nou cu GPU real: `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)`, renderer `WEBGL2`.
- Canvas 1280×720 (viewport-ul capturilor 1264×569 din fereastra headless), DPR 1, preset `MEDIUM`.
- Build de producție Vite din `scripts/vehicle-assets-server.mjs`; identitatea buildului și hash-ul
  artefactelor sunt în `build-manifest.json`, raportul în `measurement.json`.
- 24 de instanțe (12 sedan + 12 compact), 60 cadre warmup + 300 cadre măsurate.

## Bugete 223 (preset MEDIUM, `vehicleAssetManifest`)

| Metrică | Actual | Limită 223 |
| --- | ---: | ---: |
| Definiții | 7 | 256 |
| Transfer runtime | 0 B | 20 MiB (prima cursă) |
| WASM decodere / workspace | 0 / 0 B | 8 MiB / 16 MiB |
| Geometrie GPU estimată | 114.656 B | 64 MiB |
| Texturi GPU estimate | 0 B | 384 MiB (MEDIUM) |
| Variante shader | 8 | 64 |
| Diagnostice | `[]` | — |

Geometria este procedurală și originală (fără GLB/texturi la runtime), deci transferul și texturile
sunt zero prin construcție. Estimarea de geometrie este calculată exact din poziții+normale+culori+
indicii (40 B/vârf + 4 B/index), iar numărul de vârfuri/indicii al mesh-ului de caroserie din scenă
coincide cu declarația (`336/504` pe ambele clase).

## Prima utilizare (instanțe dinamice noi)

| Clasă | create | pregătire shadere | primul render | materiale | buget primul render |
| --- | ---: | ---: | ---: | ---: | ---: |
| sedan | 3,1 ms | 1,3 ms | 3,5 ms | 4 | ≤50 ms |
| compact | 2,4 ms | 0,7 ms | 3,9 ms | 4 | ≤50 ms |

`firstUse` este măsurat pe o instanță creată după ce scenele cu 24 de vehicule rulează; timpii de
pregătire a shaderelor intră în bugetul de 2000 ms al 223.

## LOD, identitate și picking

| Distanță | LOD | draw calls (scenă) | `entityId` stabil | picking | roți vizibile |
| --- | --- | ---: | --- | --- | --- |
| 8 m | NEAR | 38 | da | `taxi:01` | da |
| 60 m | MID | 38 | da | `taxi:01` | da |
| 160 m | FAR | 36 | da | `taxi:01` | nu |

Histerezisul este de 5 m, ca la batchurile 223. Pivoturile rămân în arbore la toate nivelurile;
`FAR` ascunde doar mesh-urile de roată și grupurile de lumini.

## Cost local pe 24 de instanțe

- 4 materiale partajate, 8 variante shader, 61 draw calls de aplicație (75 cu solul și șoseaua),
  85 mesh-uri, 14.448 vârfuri de corp + roți partajate.
- Trimitere CPU/render: p50 0,7 ms, p95 1,2 ms, p99 1,8 ms, max 2,0 ms; 0 cadre peste 25 ms.
- Memorie: `usedJSHeapSize` 23,6 MB; memoria GPU exactă este indisponibilă (`null`), ca în 223.
- LOD-uri simultane în vedere (overview): NEAR 0, MID 11, FAR 13.

## Comenzi

```powershell
# build + server (port explicit 5145)
node scripts/vehicle-assets-server.mjs 5145

# exportă measurement.json și capturile near/side/mid/far/overview
node scripts/vehicle-assets-capture.mjs

# teste de contract (pivoturi 023, LOD, manifest, inventar, scenă Babylon)
node --import ./scripts/register-typescript.mjs --test tests/rendering/vehicle-visuals.test.ts tests/rendering/vehicle-scene.test.ts
```

## Capturi

- `near.png` — coloană de vehicule la câțiva metri, LOD `NEAR`.
- `side.png` — profil sedan/compact, roți pe pivoturile mecanice.
- `mid.png` / `far.png` — aceeași coloană la 60 m / 160 m, trecere `MID`/`FAR`.
- `overview.png` — 24 de instanțe dinamice și LOD-uri amestecate.

## Limitări reale

- Proba este de prezentare, nu gameplay: nu conduce, nu încarcă GLB și nu măsoară fizica sau FPS-ul
  hardware al jocului integrat. Bugetul de cadre pe hardware rămâne la gate-ul 220 (și la 155/224).
- Numerele de „frame” sunt timp de trimitere CPU/render într-o buclă fără vsync, nu interval de cadru
  afișat; sunt raportate ca atare, nu ca FPS.
- Memoria GPU exactă nu este disponibilă; se raportează estimarea 223 și contoarele de resurse.
- Capturile provin din Chrome headless cu GPU real (ANGLE D3D11), nu dintr-o fereastră vizibilă;
  conținutul geometric, LOD-ul și picking-ul sunt identice, dar focusul/vsync nu fac obiectul probei.
- Asset-urile sunt procedurale, originale; nu există texturi sau fișiere GLB de la terți.
