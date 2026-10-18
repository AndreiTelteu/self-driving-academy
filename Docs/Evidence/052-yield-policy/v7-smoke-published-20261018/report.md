# PBI052 — dovezi browser pe sursa publicată (2026-10-18)

După integrarea pe main (pasul 1), smoke-ul scurt V7 a fost reluat pe **revizia publicată**, în worktree-ul
`yield-policy-01` sincronizat. Rezultatul dă dovezile de browser pentru criteriile de acceptare pe WEBGL2.
Valoare de integrare DEV: nu e acceptare de performanță/hardware și nu e o probă full.

## Sesiuni

| Folder | Rezultat |
| --- | --- |
| `browser-v7-20261018T203144981Z` | **Attempt 1 FAIL**: toate cele 14 brațe s-au înregistrat, dar `/export` a fost respins `HTTP413 052 evidence exceeds4MiB` → fără `report.json` |
| `browser-v7-20261018T204011941Z` | **Attempt 2 COMPLETE**: `report.json` 2 792 281 B, terminal `SAVED_PENDING_VERIFICATION`, 14/14 brațe |

Identități: attempt 2 `source af3fbf38…`, `artifact ea28fef1…`, `native 02dc6a4e…`, ZIP `9cd98043…`;
attempt 1 `source c7bf9454…`, `artifact dea4cc10…`, ZIP `e9d58347…`.

## Cauza eșecului attempt 1 (regresie de integrare)

`createRapierProbe().project()` din `src/vehicles/rapier` a căpătat, după baza branch-ului, câmpurile
`angularVelocityRadps` și `wheels` (stare per roată). Fixtura 052 le înregistra, deși nu le citește:

| | vechi | nou |
| --- | --- | --- |
| chei body | id, position, rotation, velocity, speed, suspension, wheelContacts | + angularVelocityRadps, wheels |
| rând de trace | 1 057 B | 4 266 B |
| arm metadata (calibrare) | 491 KB | 936 KB |
| arm metadata (măsurat) | 63 KB | 193 KB |
| raport (estimat) | 2,58 MB | ~5,7 MB |

Peste limita de transport de 4 MiB ⇒ 413. **Fix** (commit `4aee1dd0`): fixtura înregistrează doar câmpurile
stabile de traversare pe care le citește (`recordedBody`); `finalBodies`/`finalCrossingBodies` moștenesc
aceeași proiecție. Semantica probei nu se schimbă.

## Attempt 2 — structural

`WEBGL2`, `full=false`, `foreground=true`, `devicePixelRatio=1`, rezoluție internă 1920×1080, terminal
`SAVED_PENDING_VERIFICATION`, 14 brațe, cleanup renderer zero (`sceneDisposed`, 0 scene/engine, 1 canvas),
owner cleanup 4/4 resurse, `report.json` sub limita de 4 MiB.

## Criterii de acceptare — dovezi de browser (WEBGL2, fizică Rapier reală)

Brațe de calibrare: 14 m, 13 s, aceleași lumi inițiale, doar pragul diferă.

| arm | clasa | prag | acceptedTick | firstEntryTick | clearTick | collisionTick | maxImpulseNs | decizie (minGap 1,497) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | sedan | 0,2 s | 1 | 103 | 181 | **115** | **8 964,39** | ACCEPT / GAP_ACCEPTED |
| 1 | sedan | 3 s | 30 | 213 | 280 | — | 0 | REFUSE / GAP_REFUSED |
| 2 | compact | 0,2 s | 1 | 98 | 178 | **103** | **5 424,85** | ACCEPT / GAP_ACCEPTED |
| 3 | compact | 3 s | 30 | 208 | 265 | — | 0 | REFUSE / GAP_REFUSED |

- **Criteriul 1 — praguri diferite schimbă momentul traversării:** da. Cu aceeași lume, 0,2 s acceptă de la
  tick 1 și intră la 103/98, în timp ce 3 s refuză până la tick 30 și intră la 213/208.
- **Criteriul 2 — încălcările și coliziunile rămân posibile când stilul este riscant:** da. Brațele riscante
  (0,2 s) produc contact real (8 964,39 N·s sedan, 5 424,85 N·s compact), iar brațele prudente (3 s) nu.
  `minGap 1,497 s` explică ambele: peste pragul 0,2 (accept), sub pragul 3 (refuz).

Aceleași valori apar și în proba nativă AFTER (`after-main029.json`, paritate exactă cu BEFORE), deci
criteriile au dovezi atât în fixture nativ, cât și în browser, pe aceeași semantică.

## Brațe măsurate (1 s warm + 3 s, 70 mașini)

Toate cele 10 brațe curate: native ratio 1.0032–1.0093, RAF 0.9984–1.0039, `simulationToActiveWallTime`
0.9984–1.0039, overload 0, 70 body-uri finale. Fără stall în această fereastră.

## Limite

- **WEBGPU nu a fost rerulat** pe revizia publicată. Schimbarea de la revizia anterioară este doar rezolvare
  de module plus proiecția de body în fixtură (fără efect pe comportament), iar WEBGPU are deja două eșecuri
  documentate (ratio pe un braț; debt 524,6 ms), localizate la prezentarea frame-ului pe acest iGPU.
- `tests/browser/yield-policy-v7/verify.mjs` nu poate verifica o sesiune smoke-only: cere inventar complet
  (`WEBGPU-full` + `WEBGL2-full`). Derivata „smoke-only” în stil V6 cere ambele smoke-uri complete. Deci
  rezultatul rămâne `COMPLETE_SMOKE_ONLY_NO_PERFORMANCE_ACCEPTANCE`, nu verificat de primă clasă.
- Proba e DEV: 3 s per braț, un backend; nu închide gate-ul hardware/release.

## Fișiere

Capturile ambelor sesiuni (brațe, canale brute, `report.json`, `started/terminal`), ZIP-urile și
`-archive.json` sunt în acest folder părinte. Logurile serverului: `v7-smoke-published-01/`.
Sumarizator: `published-summary.mjs`.
