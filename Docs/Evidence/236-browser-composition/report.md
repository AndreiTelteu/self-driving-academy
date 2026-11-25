# 236 — compunerea în browser a lanțului V3

Transcript determinist generat de `scripts/run-v3-composition-report.mjs` cu `npm run composition:report`.
Machine-readable: [report.json](report.json), proba de browser: [browser.json](browser.json).
Contract: `236-v3-composition-v1`, tick fix la 60 Hz, harta `neighbourhood-compact-v1`,
start la (9.80, 3.20) cu yaw
1.5708 rad.

Ordinea unui tick în compunere: intenția reală (193) → tranziția cerută (195/196) → 193 `step`
și `deliver` → 192 `walker.step` (sau mișcarea mașinii conduse) → 194 `camera.step` →
198 `segments.step` → proiecția HUD.

## Secvențe

| Secvență | Intrare | Entitate controlată | Mod | Poziție (x,y,z) | Verdict |
| --- | --- | --- | --- | --- | --- |
| A-mers | throttle ținut, 120 tick-uri | `CHARACTER:player-character` | `MANUAL` | 12.397,0.000,3.200 | OK |
| B-alergare | throttle + sprint ținute, 90 tick-uri | `CHARACTER:player-character` | `MANUAL` | 13.483,0.000,3.200 | OK |
| C-intrare | G (requestEntry taxi-01) | `VEHICLE:taxi-01` | `MANUAL` | 9.800,0.000,2.050 | OK |
| D-conducere | throttle ținut, 120 tick-uri | `VEHICLE:taxi-01` | `MANUAL` | 19.163,0.000,2.050 | OK |
| E-ieșire | G (requestExit) după oprire | `CHARACTER:player-character` | `MANUAL` | 24.475,0.000,3.100 | OK |
| F-revenire-mers | throttle ținut, 90 tick-uri | `CHARACTER:player-character` | `MANUAL` | 24.475,0.140,5.011 | OK |

## Verificări (42/42)

- `mers: clipul este walk`: "walk" → "walk" (PASS) — clipul se alege din viteza măsurată de walker
- `mers: autoritatea este personajul`: "CHARACTER:player-character" → "CHARACTER:player-character" (PASS) — arbitrajul 193 produce comanda personajului
- `mers: modul raportat este MANUAL`: "MANUAL" → "MANUAL" (PASS) — personajul este condus manual; cele trei moduri rămân ale mașinii
- `mers: camera urmărește aceeași entitate`: "player-character" → "player-character" (PASS) — 194 primește authorityEntityId din 193
- `mers: camera nu este trunchiată de taxiul parcat`: null → null (PASS) — distanța realizată 3.513 m din 3.500 m
- `mers: s-a deplasat peste 1,5 m`: true → true (PASS) — deplasare 2.597 m
- `mers: o singură livrare pe tick către personaj`: {"CHARACTER":120,"VEHICLE":0} → {"CHARACTER":120,"VEHICLE":0} (PASS) — 193 `deliver` este chemat exact o dată, pe consumatorul activ
- `alergare: clipul este run`: "run" → "run" (PASS) — peste 1,05 × viteza clipului de mers, clipul măsurat este run
- `alergare: viteza depășește pragul de mers`: true → true (PASS) — viteza 2.9091 m/s vs prag 1.4395
- `intrare: autoritatea trece pe taxi`: "VEHICLE:taxi-01" → "VEHICLE:taxi-01" (PASS) — 195 întoarce exact autoritatea 193 VEHICLE:<id>
- `intrare: camera primește taxiul în același tick`: "taxi-01" → "taxi-01" (PASS) — cererea 194 din 195 este aplicată în tick-ul intrării
- `intrare: poziția personajului rămâne bit-identică`: "40239999999999a00000000000000000400999999999999a" → "40239999999999a00000000000000000400999999999999a" (PASS) — 195 nu mută corpul; walker-ul nu este pașit în tick-ul intrării
- `intrare: walker-ul nu a primit tick`: 0 → 0 (PASS) — după TAKE personajul nu mai primește input
- `intrare: modelul 198 deschide un segment MANUAL`: {"opened":"MANUAL","kind":"MANUAL"} → {"opened":"MANUAL","kind":"MANUAL"} (PASS) — ENTER este exact tranziția 195/197
- `intrare: livrările merg exclusiv către vehicul`: 1 → 1 (PASS) — exact un consumator per tick
- `intrare: personajul nu primește nicio livrare în plus`: 210 → 210 (PASS) — după TAKE inputul personajului este inactiv
- `intrare: dubla livrare este refuzată de arbitraj`: "DOUBLE_DELIVERY_REFUSED" → "DOUBLE_DELIVERY_REFUSED" (PASS) — refuzul vine din 193, nu din compunere
- `intrare: o a doua cerere cât timp ești în mașină este ignorată`: "ENTRY_IGNORED" → "ENTRY_IGNORED" (PASS) — compunerea nu inventează un al doilea TAKE
- `conducere: taxiul s-a deplasat peste 3 m`: true → true (PASS) — deplasare 9.363 m
- `conducere: modul rămâne MANUAL`: "MANUAL" → "MANUAL" (PASS) — 195 impune MANUAL și nu inventează un al patrulea mod
- `conducere: corpul personajului este neschimbat`: "40239999999999a00000000000000000400999999999999a" → "40239999999999a00000000000000000400999999999999a" (PASS) — walker-ul nu este pașit cât timp autoritatea este a mașinii
- `conducere: comenzile merg exclusiv către vehicul`: 122 → 122 (PASS) — 120 de tick-uri de conducere, 120 livrări de vehicul
- `conducere: camera urmărește taxiul`: "taxi-01" → "taxi-01" (PASS) — 194 urmărește exact authorityEntityId
- `conducere: modelul 198 ține tick-ul cu FOCUS pe mașină`: "FOCUS" → "FOCUS" (PASS) — 198 nu are pas DRIVE; FOCUS nu schimbă autoritatea
- `frânare: taxiul ajunge la 0 m/s`: true → true (PASS) — 196 refuză ieșirea peste 1,371 m/s
- `ieșire: autoritatea revine la personaj`: "CHARACTER:player-character" → "CHARACTER:player-character" (PASS) — 196 întoarce exact autoritatea 193 CHARACTER:<id>
- `ieșire: mașina eliberată revine în AUTO`: "AUTO" → "AUTO" (PASS) — singurul câmp schimbat de 196 este controlMode
- `ieșire: camera primește personajul în același tick`: "player-character" → "player-character" (PASS) — cererea 194 din 196 este aplicată în tick-ul ieșirii
- `ieșire: segmentul MANUAL este închis cu RETURN_TO_AUTO`: "RETURN_TO_AUTO" → "RETURN_TO_AUTO" (PASS) — 198 închide segmentul la ieșire
- `ieșire: niciun candidat de estimator pentru MANUAL`: 0 → 0 (PASS) — numai LEARNING eligibil produce candidat 069
- `ieșire: personajul primește din nou input`: 211 → 211 (PASS) — după RETURN vehiculul nu mai primește input
- `ieșire: vehiculul nu primește nicio livrare în plus`: 192 → 192 (PASS) — exact un consumator per tick, acum personajul
- `ieșire: punctul de ieșire stă pe suprafața autorată`: 0 → 0 (PASS) — 196 furnizează exact WalkerOptions.start, iar walker-ul confirmă cota
- `ieșire: camera găsește un cadru liber după tranziție`: true → true (PASS) — distanță 3.500 m, obstacol null
- `revenire: clipul este din nou walk`: "walk" → "walk" (PASS) — după ieșire personajul merge din nou pe jos
- `revenire: poziția s-a schimbat față de punctul de ieșire`: true → true (PASS) — mersul post-ieșire deplasează din nou corpul
- `revenire: mașina eliberată nu mai primește input`: {"x":24.475000000000037,"z":2.0500000000000003,"speed":0} → {"x":24.475000000000037,"z":2.0500000000000003,"speed":0} (PASS) — după RETURN vehiculul nu este pașit; poziția și viteza rămân înghețate
- `animație: 60/60 cadre de render păstrează poziția bit-identică`: 60 → 60 (PASS) — 191 copiază poziția autoritară, nu o calculează
- `animație: writer-ul refuză poziția și root motion`: ["AUTHORITY_WRITE_REFUSED","AUTHORITY_WRITE_REFUSED"] → ["AUTHORITY_WRITE_REFUSED","AUTHORITY_WRITE_REFUSED"] (PASS) — canalele de scriere există ca să refuze explicit
- `determinism: două rulări produc aceleași rânduri și verificări`: "272ec2f38409399ec26bc9602cf3c1afd2a901d7c4b03104fe6d3bbf43cb8950" → "272ec2f38409399ec26bc9602cf3c1afd2a901d7c4b03104fe6d3bbf43cb8950" (PASS) — același input, același tick, aceeași poziție
- `compunere: fiecare tick are exact o livrare`: 0 → 0 (PASS) — 193 `deliver` este singurul canal către consumatori
- `compunere: suma livrărilor acoperă toate tick-urile`: 518 → 518 (PASS) — personaj + vehicul = tick-uri

## Operații

- `ticks`: 518
- `deliveriesCharacter`: 326
- `deliveriesVehicle`: 192
- `ticksWithoutDelivery`: 0
- `walkerTicks`: 116
- `cameraFrames`: 518
- `segmentCommands`: 518
- `entryAttempts`: 1
- `exitAttempts`: 1

## Cost

**NOT_RUN** — Măsurătoarea de frame/tick se face în browser real (SwiftShader) și se scrie în browser.json; Node headless nu este raportat ca FPS hardware.

## Proba de browser

Browser: **Chromium 156.0.8078.4**, backend **WEBGL2** (WebGL 2, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)).
Capturi: [screenshots/01-start.png](screenshots/01-start.png), [screenshots/02-mers.png](screenshots/02-mers.png), [screenshots/03-alergare.png](screenshots/03-alergare.png), [screenshots/04-intrare.png](screenshots/04-intrare.png), [screenshots/05-auto.png](screenshots/05-auto.png), [screenshots/06-conducere.png](screenshots/06-conducere.png), [screenshots/07-iesire.png](screenshots/07-iesire.png), [screenshots/08-revenire.png](screenshots/08-revenire.png).
Trafic AI: **24** mașini, **24** s-au deplasat peste 1 m în timpul probei.
HUD: **8 km/h** în AUTO, mod afișat „AUTO · Conduce AI-ul (M)”; după butonul HUD: „MANUAL · Conduci tu (M)”.

| Secvență | Taste reale | Entitate controlată | Mod | Clip | Poziție (x,z) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| start | `—` | `CHARACTER:player-character` | `MANUAL` | `idle` | 9.80, 3.20 | PASS |
| mers | `W` | `CHARACTER:player-character` | `MANUAL` | `walk` | 11.76, 3.20 | PASS |
| alergare | `W+F` | `CHARACTER:player-character` | `MANUAL` | `run` | 16.48, 3.20 | PASS |
| intrare în taxi | `G` | `VEHICLE:taxi-01` | `MANUAL` | — | 9.80, 2.05 | PASS |
| AUTO | `M` | `VEHICLE:taxi-01` | `AUTO` | — | 8.02, 2.10 | PASS |
| revenire MANUAL prin buton | `click mod` | `VEHICLE:taxi-01` | `MANUAL` | — | 4.80, 2.10 | PASS |
| conducere | `W` | `VEHICLE:taxi-01` | `MANUAL` | — | -11.78, 2.10 | PASS |
| frânare până la oprire | `S` | `VEHICLE:taxi-01` | `MANUAL` | — | -26.00, 2.10 | PASS |
| ieșire din taxi | `G` | `CHARACTER:player-character` | `MANUAL` | `idle` | -26.00, 1.05 | PASS |
| revenire la mers | `W` | `CHARACTER:player-character` | `MANUAL` | `walk` | -26.00, -0.18 | PASS |

### Cost măsurat în browser (software, nu hardware)

| Metrică | eșantioane | medie ms | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tick de compunere | 600 | 5.6065 | 5.4000 | 7.7000 | 45.2000 |
| Prezentare (personaj + cameră + HUD) | 284 | 1.5796 | 0.4000 | 0.6000 | 335.4000 |
| Interval între cadre | 283 | 1834.1671 | 1480.2000 | 4762.6000 | 8156.2000 |

Backendul este SwiftShader (randare software), deci intervalele de cadru **nu** sunt o
măsurătoare FPS hardware și nu sunt comparate cu bugetul de GPU. Tick-ul de compunere este
comparat cu bugetul provizoriu de 8 ms/tick din contractul 25.

## Limitări

- Mișcarea mașinii conduse este un adaptor de jucabilitate peste comanda 024 și mecanica 023 (masă, forță, frână, ampatament, bracaj); fizica Rapier 022/024 nu este compusă aici.
- 198 nu are pas DRIVE: cât timp jucătorul stă în mașină, modelul este ținut în pas cu FOCUS pe vehiculul condus, iar contorul `focus` este raportat explicit.
- Scenariul folosește resetarea de probă (`resetScenario`) între mers/alergare și intrare, pentru ca aceleași taste reale să poată fi probate din poziția de start.
- Raportul headless nu măsoară frame/tick; costul real este în browser.json (backend software, nu hardware).
