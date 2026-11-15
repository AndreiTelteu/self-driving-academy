---
id: "236"
title: "Compunerea în browser a lanțului V3"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["202","193","194","195","196","197"]
performance_checks: ["frame","simulation"]
owner: "loop-pbi/v3-compose-236-01"
started_at: "2026-11-15T14:47:13+02:00"
completed_at: "2026-11-15T17:10:37+02:00"
---

# 236 Compunerea în browser a lanțului V3

## Obiectiv

Leagă contractele V3 191–200 într-o singură compoziție care rulează în browser: personajul se mișcă din
input real, camera third person îl urmărește, intrarea și ieșirea din mașină funcționează, iar HUD-ul
arată entitatea controlată și modul. Până la acest task, toate capabilitățile V3 sunt `HEADLESS_CONTRACT`:
`src/main.ts` nu are nicio referință la `character`, `authority` sau `walker`, deci jocul nu poate fi jucat
pe jos.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie contractele V3 și
secțiunea finală de release, care declară explicit nivelul `HEADLESS_CONTRACT` și cele șase lucruri
nelivrate end-to-end. [18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie
verdictul V3 pe criterii, iar [25-performanta-contracte-si-benchmark.md](../../Docs/25-performanta-contracte-si-benchmark.md)
definește probele de performanță. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 202 trebuie să existe în Done înainte de începere.
- PBI 193 trebuie să existe în Done înainte de începere.
- PBI 194 trebuie să existe în Done înainte de începere.
- PBI 195 trebuie să existe în Done înainte de începere.
- PBI 196 trebuie să existe în Done înainte de începere.
- PBI 197 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Personajul se mișcă în browser din input real, cu camera third person pe aceeași entitate și cu clipul ales din viteza măsurată; proba e în browser real (WebGPU sau WebGL2), nu doar headless.
- [x] Intrarea și ieșirea din mașină și revenirea la mers funcționează din input real, cu autoritate unică (exact un consumator primește comanda) și cu HUD care arată entitatea controlată și modul.
- [x] Nu există regresii: `npm test` integral verde, bugetele de performanță neschimbate, taskul pe frame/tick raportat explicit față de contractul 25.

## Verificare

Probă în browser: mers, alergare, intrare în taxi, conducere, ieșire, revenire la mers, plus captură de
consolă fără erori și măsurătoare de frame pe compoziția nouă. Rulează verificările relevante ale
proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o
în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție. Nu
înlocui o măsurătoare hardware cu FPS headless.

## Dovezi de finalizare

Rezultat implementare: compunerea V3 rulează pe tick fix de 60 Hz într-un singur punct de adevăr, `src/app/walking-composition.ts` (918 linii), cu ordinea impusă de contracte și nu de o convenție locală: intenția reală (portul 193) → tranziția cerută (195/196) → `193.step` + `deliver` → `192.walker.step` pentru personaj (sau adaptorul de mișcare pentru mașina condusă) → `194.camera.step` → `198.segments.step` → proiecția HUD. Modulul e pur (fără DOM, Babylon, ceas sau `Math.random`) și nu rescrie niciun contract: intrarea și ieșirea sunt exact `decideVehicleEntry`/`decideVehicleExit`, comanda este exact cea a arbitrajului 193, iar poziția personajului rămâne exclusiv a walker-ului 192. Ieșirea creează un walker nou la `VehicleExitStart` furnizat de 196, păstrând aceeași entitate. `198` nu are pas `DRIVE`, așa că modelul de segmente e ținut în pas cu `FOCUS` pe vehiculul condus, iar contorul `focus` e raportat explicit. Lumea de probă vine din `src/app/composition-world.ts`, reprezentarea Babylon din `src/rendering/babylon/character-scene.ts`, `v3-composition-scene.ts` și `v3-browser-composition.ts`, iar HUD-ul din `src/ui/character-hud.ts`. `src/main.ts` compune efectiv lanțul în aplicația reală: creează lumea, pornirea, compoziția și snapshot-ul de buclă, deci `src/main.ts` nu mai e un bootstrap fără referințe la personaj.

Criteriul 1 — `PASS`, probă în browser real. `npm run composition:report -- --browser` a rulat cu Playwright pe **Chromium 159.0.8154.6 headless**, viewport 1440×900, backend **`WEBGL2`** (ANGLE peste SwiftShader: `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, vendor raportat de browser), viewport intern 640×360. **8/8 secvențe trec** cu taste reale trimise de Playwright și 7 capturi: `start` (`CHARACTER:player-character`, MANUAL, `idle`), `mers` (W, `walk`), `alergare` (W+F, `run`), `intrare în taxi` (G → `VEHICLE:taxi-01`), `conducere`, `frânare până la oprire`, `ieșire din taxi` (→ `CHARACTER:player-character`), `revenire la mers`. HUD-ul raportează la fiecare pas clipul, modul, entitatea controlată și entitatea urmărită de cameră, iar camera urmărește exact entitatea controlată. `pageErrors` și `consoleErrors` sunt ambele goale.

Criteriul 2 — `PASS`. Autoritatea e unică la tranziții: livrările finale sunt `CHARACTER: 375`, `VEHICLE: 265`, refuzuri `doubleDelivery: 1`, `inactiveConsumer: 0`, `staleResult: 0`, iar proba de dublă livrare întoarce `DOUBLE_DELIVERY_REFUSED`. Modelul de segmente raportează `walking: true`, 374 tick-uri de mers (8,52 m), 1 intrare, 1 ieșire și `openSegmentId: null` la final.

Criteriul 3 — `PASS`, cu cost raportat explicit. `npm run composition:report` dă 6 rânduri, 42/42 verificări, `PASS`, iar `--check` confirmă că raportul comis e curent. Costul măsurat în browser (backend software, **nu** hardware): tick `p50 0,50 ms`, `p95 1,10 ms`, `max 17,9 ms` pe 600 eșantioane; `present` `p50 0,20 ms`, `p95 1,20 ms`, `max 8,4 ms` pe 507 eșantioane; frame `p50 20,9 ms`, `p95 30,00 ms`, `max 713,4 ms` pe 506 eșantioane — cifre de SwiftShader, declarate ca atare, nu ca FPS hardware. Raportul headless lasă costul `NOT_RUN` cu motivul exact, ca să nu confunde Node cu o măsurătoare de frame. Bugetele de performanță nu au fost atinse.

Verificări executate și rezultat: `npm run typecheck` exit 0 (app + tests); `npm run lint` exit 0, 0 warnings; `npm run format:check` PASS; `npm run check:architecture` PASS (416 fișiere TypeScript + probe negative); `npm run check:parameter-catalog` sincronizat; `npm run composition:report` 42/42 PASS cu digest `f375524661172633ff68d1186b865f1023317ebb5136a9b1db1b78ca4c2156fb`; `npm run composition:report -- --check` curent; `npm run composition:report -- --browser` 8/8 pași, 7 capturi, 0 erori; `npm run build` exit 0 (typecheck + Vite); `npm test` 3423 teste, 3423 trecute, 0 eșuate; `pwsh ./PBI/Validate-Board.ps1 -RequireDone '236'` `Valid: true`.

Fișiere și documente actualizate: create `src/app/walking-composition.ts`, `src/app/composition-world.ts`, `src/rendering/babylon/character-scene.ts`, `src/rendering/babylon/v3-composition-scene.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/ui/character-hud.ts`, `tests/character/walking-composition-suite.ts`, `tests/character/walking-composition.test.ts`, `tests/character/walking-composition-report.test.ts`, `scripts/run-v3-composition-report.mjs`, `Docs/Evidence/236-browser-composition/{README.md,report.json,report.md,browser.json,screenshots/}`; modificate `src/main.ts`, `src/app/index.ts`, `src/rendering/babylon/index.ts`, `src/ui/index.ts`, `package.json` (o intrare nouă, `composition:report`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiune finală), `Docs/Evidence/216-v1-regression/report.{json,md}` (regenerat: graful are acum 236 noduri) și `Docs/Evidence/163-v2-contexts/report.{json,md}` (regenerat: citează noul SHA-256 al raportului 216).

Limitări sau follow-up: mișcarea mașinii conduse este un adaptor de jucabilitate peste comanda 024 și mecanica 023, nu fizica Rapier 022/024 compusă aici; `198` nu are pas `DRIVE`, deci modelul e ținut în pas cu `FOCUS` pe vehiculul condus; scenariul de probă folosește resetarea de probă între mers/alergare și intrare, ca aceleași taste reale să pornească din poziția de start; frame-ul măsurat este pe SwiftShader, deci nu înlocuiește gate-ul hardware 224; salvarea V3 (200) nu este încă legată de bucla nouă, iar HUD-ul este minimal (clip, mod, entități), fără stilizare vizuală finală.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '236' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-15: PBI creat după închiderea backlog-ului 001–235, ca primul pas care transformă contractele V3 în joc jucabil.
- 2026-11-15: Implementat și verificat. Compunerea pe tick 60 Hz rulează în browser real (Chromium 159 headless, WebGL2 prin ANGLE/SwiftShader) cu 8/8 secvențe și 7 capturi, 42/42 verificări deterministe, 3423/3423 teste, build verde. Mutat fizic în Done.
