---
id: "192"
title: "Controller fizic pentru mers pe jos"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["191","022"]
owner: "loop-pbi/v3-physics-192-01"
started_at: "2026-11-14T19:57:00+02:00"
completed_at: "2026-11-14T20:31:48+02:00"
---

# 192 Controller fizic pentru mers pe jos

## Obiectiv

Implementează deplasare pe sol, coliziuni și trepte în limitele confirmate.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 191 trebuie să existe în Done înainte de începere.
- PBI 022 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Personajul nu trece prin clădiri și vehicule.
- [x] Fizica de mers nu dublează corpurile auto.

## Verificare

Testează trotuar, trepte, obstacol și contact cu mașină.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contract `192-walker-v1` în `src/character/` (`walker.ts`, `walk-world.ts`, `walk-geometry.ts`). Walker determinist pe tick fix de 60 Hz, fără ceas, DOM sau aleatorism: input (direcție + mod NONE/WALK/RUN + intensitate) → viteză țintă din vitezele nominale ale clipurilor 191 (1,3710 / 2,9091 m/s) → deplasare pe substep-uri de cel mult 0,05 m → coliziune cerc-poligon convex (până la 8 treceri) → trepte → clip ales din viteza măsurată (idle sub 0,05 m/s, walk până la 1,05 × viteza de mers, run peste) → autoritate unică. Capsula vine din 191: rază 0,150 m (amprenta 0,300 × 0,260 m) și înălțime 1,780 m. Lumea de mers e derivată din layout-ul 042: carosabil 0, trotuar 0,14 m, interiorul insulei ca placă la aceeași cotă, clădirile ca solide cu amprenta și înălțimea reală; bordura pictată 2 cm peste trotuar nu este o a doua treaptă. Plafonul de treaptă este bordura reală `CITY_LAYOUT_DEFAULTS.sidewalkElevationM` = 0,14 m (`WALKER_POLICY.stepCeilingM`): 0,14 m se urcă și se coboară, peste plafon muchia se comportă ca perete și refuzul e raportat (`STEP_REFUSED_ASCENT`/`STEP_REFUSED_DESCENT`). Criteriul 2 este structural: 0 corpuri auto create, `registerVehicleBody` aruncă `VEHICLE_BODY_WRITE_REFUSED`, `writeVehicleState` aruncă `VEHICLE_STATE_WRITE_REFUSED`, vehiculele intră doar ca amprente înghețate cu colliderul real 0,85 × 2,00 m din 022/145. Contactul cu mașina oprește la 0,15 + 0,85 + 0,05 = 1,05 m față de linia mediană, fără intrare în collider. `renderFrame()` copiază poziția fără aritmetică (120/120 cadre bit-identice), iar writer-ul de animație rămâne output-only. Startul în interiorul unui solid este refuzat cu `WALK_START_BLOCKED`.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS („All matched files use Prettier code style!”); `npm run check:architecture` PASS (402 fișiere TypeScript, sondele negative 6+4+3 trec); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` **3290 teste, 3290 pass, 0 fail** (110,6 s); testele țintă `tests/character/*.test.ts` **40 teste, 40 pass, 0 fail**; `npm run walker:report` PASS cu **8/8 scenarii**, penetrare maximă **1,44 × 10⁻¹⁵ m**, criteriu 1 PASS, criteriu 2 PASS, autoritate unică PASS, **0 corpuri auto**, determinism identic (SHA-256 `c9d66eca1d3f7b4164537d9113467851b76cd238ae34fc719cf072019d8fa228`); `npm run walker:report -- --check` PASS („Walker report is current”, „Walker markdown is current”); `pwsh ./PBI/Validate-Board.ps1 -RequireDone '192'` → `Valid: true`, 235 PBI-uri (To Do 10, In Progress 0, Done 225), `RequiredDonePaths` conține fișierul 192. Scenarii reale: zid (240 pași, oprire la o rază de fațadă, 1,44e-15 m penetrare), trotuar (120 pași, y = 0,1400 pe tot parcursul), bordură 0,14 m urcată și coborâtă, treaptă de 0,30 m refuzată cu 0 penetrare, prăpastie de 0,28 m refuzată, obstacol 0,8 × 0,8 m oprit la 2,40 m, contact cu sedanul la 0,7500 m (1,05 m față de linia mediană). Detalii în [Evidence/192-v3-walker](../../Docs/Evidence/192-v3-walker/README.md).

Fișiere și documente actualizate: `src/character/walker.ts`, `src/character/walk-world.ts`, `src/character/walk-geometry.ts`, `src/character/index.ts`, `src/character/errors.ts`; `tests/character/walk-world.ts`, `walker-collision.test.ts`, `walker-authority.test.ts`, `walker-suite.ts`, `walker-report.test.ts`; `scripts/run-v3-walker-report.mjs`; `package.json` (un singur script nou, `walker:report`, ultima intrare); `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final); `Docs/Evidence/192-v3-walker/{README.md,report.json,report.md}`.

Limitări sau follow-up: coliziune planară (cilindru contra poligoanelor convexe cu cotă); pantele continue, rampele line și interioarele nu există în layout-ul 042 și nu sunt simulate. Vehiculele sunt amprente înghețate: nu se simulează împingerea lor de către personaj și nici transferul de control (195). Treptele sunt suprafață + plafon, nu rampă. Proba este headless, fără browser, GPU, input uman sau playtest; reprezentarea vizuală rămâne cea livrată de 191, iar camera și integrarea în scenă aparțin 195.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '192' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14T19:57:00+02:00: preluat pe branch-ul `loop-pbi/v3-physics-192-01`; status In Progress, owner și started_at completate, fișier mutat fizic în In Progress și boardul validat.
- 2026-11-14T20:31:48+02:00: implementare `192-walker-v1` finalizată; verificările complete (`npm test` 3290/3290, raport determinist 8/8 scenarii, penetrare maximă 1,44e-15 m, 0 corpuri auto create, autoritate unică 120/120 cadre bit-identice); fișier mutat fizic în Done și validat cu `-RequireDone '192'`.
