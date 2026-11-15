---
id: "242"
title: "Suprafață de drum fără goluri, teren până la orizont și limita hărții"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["239"]
performance_checks: ["simulation","frame"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-15T21:23:42.009Z"
completed_at: "2026-11-16T01:07:06+02:00"
---

# 242 Suprafață de drum fără goluri, teren până la orizont și limita hărții

## Obiectiv

Repară trei defecte ale lumii vizibile în audit:

1. Pe carosabil apare o dungă albastru-deschis de exact culoarea cerului (`clearColor`). Este un gol în suprafața drumului.
2. Terenul se termină la marginea orașului; dincolo de el se vede vidul albastru.
3. Mașina condusă poate ieși de pe hartă și ajunge în vid (captura 17).

## Context și plan

Suprafețele benzilor din `city-scene.ts` sunt extrudate per bandă (`LANE_SURFACE`, vezi [city-visual](../../Docs/city-visual.md)). Între benzi sau între bandă și bordură rămâne un gol. Coliziunea 238 (`src/app/vehicle-collision.ts`) acoperă clădirile și decorul, nu și marginea lumii. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problemele 5–6.

## Dependențe

- PBI 239 trebuie să fie în Done.

## Criterii de acceptare

- [x] Suprafața carosabilă, a intersecțiilor și a trecerilor este continuă: un test geometric verifică faptul că, pe fiecare segment, uniunea benzilor acoperă lățimea dintre borduri fără goluri mai mari de 1 mm; în cadrele 239 nu apare niciun pixel de `clearColor` sub linia orizontului.
- [x] Nu există z-fighting între bandă, marcaj și intersecție; ordinea pe verticală este documentată (marcajele folosesc offset de adâncime sau decal, nu o înălțime arbitrară).
- [x] Terenul continuă dincolo de oraș până la `camera.maxZ`, cu un fundal la distanță (dealuri sau siluete de oraș, low-poly, nesimulate), astfel încât orizontul să nu fie o linie tăiată.
- [x] Mașina condusă și personajul nu pot ieși din limitele hărții: o barieră fizică (parapet, gard sau teren care urcă) este vizibilă și oprește mișcarea, folosind aceeași metodă de măturare ca 238 și același comportament determinist.
- [x] Contractul 238 (coliziunea cu clădirile și decorul) și testele lui trec neschimbate.

## Verificare

Test geometric de acoperire a carosabilului pe harta implicită și pe toate hărțile 158. Test de compunere care conduce mașina cu accelerație maximă spre fiecare margine și verifică, la fiecare tick, că rămâne în interior. Capturi 239 (stradă, intersecție, orizont, marginea hărții). Raportează costul de simulare al barierei.

## Dovezi de finalizare

**Rezultat.** Dunga de culoarea cerului avea două cauze geometrice reale (nu winding sau culling): (1) intervalele de 0,8 m (axă) și 0,3 m (între benzile unei artere) dintre `LANE_SURFACE`, acoperite acum de 56 de fâșii derivate în `src/rendering/road-surface.ts`; (2) lipsa feței verticale a bordurii, prin care razele razante dinspre stradă treceau pe sub trotuar/bordură/teren la `clearColor`, acoperită de câte un perete de bordură și de pereți la colțurile blocurilor (bordurile E/V se opresc înaintea colțului) în `city-scene.ts`. Terenul continuă acum până la ~2,5 km de limită (19 bucle, dealuri și creste cu înălțime din zgomot determinist, culori pe vârf spre culoarea cerului, `camera.maxZ` 3000), cu parapet vizibil (grindă pe stâlpi) pe limita hărții. Limita fizică este `layout.worldLimit` (`src/world/world-limit.ts`): patru ziduri `LIMIT` în `createCityWalkWorld`, tratate de aceleași solvere ca clădirile (walker 192, mașină 238), fără cod nou de solver. Ordinea pe verticală este documentată în `Docs/city-visual.md` (cote + `DEPTH_BIAS`).

**Fișiere.** Noi: `src/world/world-limit.ts`, `src/rendering/road-surface.ts`, `src/rendering/world-edge.ts`, `src/rendering/babylon/world-edge-scene.ts`, `tests/rendering/{road-surface,curb-faces,world-edge,vertical-order}.test.ts`, `tests/app/world-limit.test.ts`, `Docs/Evidence/242-road-world-edge/`. Modificate: `src/world/{city-layout,index}.ts` (câmpul `worldLimit`), `src/character/walk-world.ts` (`kind: 'LIMIT'`, `stats.limits`), `src/rendering/babylon/{city-scene,v3-composition-scene}.ts`, `src/rendering/{quality-policy,visual-capture}.ts` (preseturi `WORLD_EDGE_PRESETS`, vederea `map-edge-barrier`), `Docs/{30-calitate-vizuala-v4,city-visual,20-extensii-si-mers-pe-jos}.md`, `Docs/Evidence/157-render-budget/{after,report}.json|md` (regenerate cu `perf:render-budget -- --measure`: vârfurile orașului 18.580 → 19.572, triunghiurile 9.314 → 9.810, 12 desenări neschimbate, 17 PASS).

**Schimbări intenționate de contract.** `WALK_BLOCKER_KINDS` are valoarea nouă `LIMIT` și `WalkWorldStats` câmpul `limits`; `CityLayout` are câmpul `worldLimit`. Testul 192 „walker-ul creează 0 corpuri auto” cere `stats.obstacles === 0`: de aceea zidurile sunt `LIMIT`, nu `OBSTACLE`; testele nu au fost modificate. Testele 238 (`tests/app/vehicle-collision.test.ts`) sunt neschimbate și trec.

**Teste și verificări (rezultate reale).** `npm run typecheck` ok; `npm run lint` ok (0 avertismente); `npm run format:check` ok; `npm run check:architecture` PASS (modulele de prezentare importă doar tipuri din domeniu); `npm test` 3490 teste, 3490 pass, 0 fail (rulare după implementare, înaintea ultimei ajustări a testului `vertical-order`, rulat apoi separat: 2/2). Noi: `road-surface` (8: gol maxim ≤ 1 mm pe secțiuni transversale, pe harta implicită, `minimal-road-v1`, `intersection-CROSS-v1`, `intersection-T-v1`; marginile ating blocurile; fâșiile nu se suprapun cu benzile; banda curbă raportată), `curb-faces` (3: ray-cast pe tot conturul blocurilor 0/22.720 raze în cer, 1.120 fără pereții de colț și 3.638 fără niciun perete de bordură; orientarea fețelor; raze verticale sub fiecare fâșie), `vertical-order` (2: nicio pereche suprapusă de materiale diferite la aceeași cotă), `world-edge` (8: teren plat/continuu/determinist, normale în sus, parapet, 3 desenări pe LOW/MEDIUM/HIGH, eliberare completă), `world-limit` (9: mașina la accelerație maximă spre fiecare margine și oblic rămâne în interior la fiecare tick, determinism bit cu bit, personajul alergând spre fiecare margine, zidurile `LIMIT`). Mutație verificată: fără zidurile `LIMIT` 8 din 9 teste pică; fără fețele bordurii pică ray-cast-ul. `qa:v1-regression --check` 27/29 PASS, 0 FAIL, 2 NOT_RUN, pierderi XP 0, curent; `v2:contexts --check` 56/56, curent; `assets:manifest --check`, `check:parameter-catalog`, `city:dashboard`, `city:style`, `hud:minimap`, `vertical:slice` `--check`: curente; `perf:render-budget --check`: curent după regenerare. `qa:v3-validation --check` raportează markdown învechit (măsurătoarea 201 a fost făcută la commit-ul b1c76c14, înainte de 239–241): nu a fost regenerată, nu depinde de acest PBI.

**Browser / vizual (WebGPU real `amd rdna-2`, WebGL2 ANGLE/D3D11 AMD).** `npm run visual:capture` HIGH/WebGPU înainte (13 cadre) și după (14 cadre), plus LOW/WebGPU și HIGH/WebGL2 după. Capturile `street-eye-level`, `horizon`, `map-edge` nu mai arată dunga albastră; `city-aerial` arată terenul continuu până la dealuri; `map-edge-barrier` arată taxiul oprit la parapet. Pixeli de culoarea cerului sub orizont (`sky-scan.txt`): 518.378 → 2.457 (HIGH WebGPU), 2.791 (LOW WebGPU), 2.467 (HIGH WebGL2); reziduul nu este cer: grupările rămase (`SKY_SCAN_CLUSTERS=1`) sunt pe brațul personajului (`character-close`, ~1.800 px) și pe coroana unui copac (`taxi-rear-driving`), fals-pozitive ale euristicii; inspecția vizuală a celor 14 cadre nu arată nicio dungă.

**Condus real în browser.** Build de producție, WebGPU `rdna-2`, 1600×900, taste reale (`drive-edge.mjs`): Pornește, G, W ținut; taxiul ajunge la 11,2 m/s, trece de capătul străzii (x = 724) și se oprește la x = 745,9999 (botul la 747,9999 față de limita de 748), 0 erori de pagină; `drive-edge-end.png` arată parapetul și dealurile.

**Performanță.** Randare (HIGH WebGPU, `rdna-2`, 1920×1080, fără vsync, 3 rulări intercalate): 3,26 → 3,61 ms medie pe 5 vederi (+0,35 ms); LOW WebGPU 1,66 → 1,88 ms (+0,22 ms). Simulare: 2,2–2,5 µs per `sweep` în interior (neschimbat), 5,85 µs în cazul cel mai scump (contact permanent cu zidul), adică 0,035% dintr-un cadru la 60 Hz. Măsurătoarea de randare s-a făcut înaintea pereților de colț ai blocurilor (+496 de vârfuri, aceleași 12+3 desenări). Detalii și intervale în `perf-summary.txt` și `sim-cost.txt`. Nivel targeted (politica 25): nu certifică performanța jocului integrat.

**Limitări.** Parapetul și terenul au materiale simple și culori pe vârf (245/249 le înlocuiesc), ceața reală și cerul vin la 243; WebGL2 nu are trei rulări de performanță; fâșiile de umplere nu acoperă benzi curbe (raportate în `skipped`; nu există la hărțile actuale); capturile 239 din dovezi sunt păstrate doar parțial (PNG selectate, manifeste complete).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '242' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: dungă de cer pe carosabil, vid după margine, taxi ieșit de pe hartă.
- 2026-11-16T01:07:06+02:00: implementat de subagentul Sonnet, aprobat de review-ul independent Sonnet (review-round1.md, APPROVED); orchestratorul a corectat comentariul din world-limit.ts, a regenerat raportul 201 qa:v3-validation (învechit din commiturile V4 anterioare), a verificat și a mutat în Done.
