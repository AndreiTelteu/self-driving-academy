---
id: "196"
title: "Ieșirea din mașină și punct valid"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["195","040"]
owner: "loop-pbi/v3-exit-196-01"
started_at: "2026-11-14T22:28:38.459+02:00"
completed_at: "2026-11-14T22:51:34.261+02:00"
---

# 196 Ieșirea din mașină și punct valid

## Obiectiv

Alege poziție fizic validă și transferă autoritatea către personaj.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 195 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Personajul nu apare în collider sau sub hartă.
- [x] Mașina eliberată reia politica și traseul potrivite.

## Verificare

Testează uși blocate, mașină în mișcare și zonă ocupată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `196-exit-vehicle-v1` este livrat în `src/character/exit-vehicle.ts` (funcția pură `decideVehicleExit`) și exportat la finalul `src/character/index.ts`. Candidații sunt generați în ordine fixă (cele două flancuri, spate, față, apoi inelul secundar la 0,60 m), iar un punct este admis numai dacă amprenta 191 (0,300 × 0,260 m) păstrează marja de 0,05 m față de caroseria eliberată, fiecare altă mașină și fiecare solid autorat, dacă solul este suprafața autorată (nu sub planul hărții) și dacă treapta nu depășește bordura reală de 0,14 m. Refuzurile per candidat sunt `SOLID`, `OTHER_VEHICLE`, `STEP_TOO_HIGH`, `BELOW_MAP`; când niciunul nu e valid, ieșirea este `NO_VALID_EXIT` și corpul nu este mutat. Mașina eliberată devine `AUTO` și primește înapoi banda, `routeLaneIds`, `rideId` și progresul din snapshot-ul de dinainte de preluare (195), cu amprentă IEEE-754 verificată structural. Autoritatea revine la `CHARACTER` în același tick, camera primește cererea 194 pentru același tick (tranziția existentă de 18 tick-uri), iar un start invalid este refuzat de 192 cu `WALK_START_BLOCKED`.

Verificări executate și rezultat: Pe această mașină, în worktree-ul `v3-exit-196-01` (branch `loop-pbi/v3-exit-196-01`): `npm run typecheck` exit 0; `npm run lint` exit 0, 0 warnings; `npm run format:check` „All matched files use Prettier code style!”, exit 0; `npm run check:architecture` PASS (406 fișiere TypeScript, probe negative 6+4+3), exit 0; `npm run check:parameter-catalog` „Parameter catalog is synchronized.”, exit 0; `npm test` **3349/3349 teste trecute, 0 eșuate**, 1 suită, 111 210,9 ms; testele țintă `exit-vehicle.test.ts` + `exit-vehicle-report.test.ts` **15/15 trecute**; `npm run exit:report` **12/12 scenarii PASS** (8 ieșiri acceptate, 4 refuzuri), criteriu 1 PASS, 2a PASS, 2b PASS, cameră PASS, start walker PASS (13/13 candidați cu collider refuzați de 192), penetrare maximă 0 m, marjă minimă 0,0500 m, sub sol 0 m, entități 2 → 2, tranziție cameră 18/18, determinism identic, digest SHA-256 `419c5643fe21039781692ccc69bda3594330ac82044c594e6f3d4c2d4b75d0c`; `npm run exit:report -- --check` „report is current” + „markdown is current”, exit 0.

Fișiere și documente actualizate: `src/character/exit-vehicle.ts` (nou), export aditiv în `src/character/index.ts`, `tests/character/exit-vehicle.test.ts`, `tests/character/exit-vehicle-suite.ts`, `tests/character/exit-vehicle-report.test.ts` (noi), `scripts/run-v3-exit-report.mjs` (nou), `package.json` (o singură intrare nouă, ultima: `exit:report`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final), `Docs/Evidence/196-v3-exit/{README.md,report.json,report.md}`, acest fișier PBI.

Limitări sau follow-up: Registrul 068 scrie doar `tick`, `controlMode` și `appliedProfileVersion`; banda, ruta, cursa și progresul restaurate sunt returnate ca date și trebuie aplicate de proprietarul 061/044 — contractul le compară bit-identic cu snapshot-ul de dinainte de preluare, dar nu poate muta singur registrul flotei. Progresul pe rută este cel de dinainte de preluare, nu cel condus manual (segmentul MANUAL/LEARNING se închide separat în 069); dacă designul cere continuarea progresului manual, baseline-ul trebuie să fie starea curentă. Contractul este planar ca 192 (fără portaluri, trape sau garduri suspendate) și nu modelează un mâner; al doilea inel este la 0,60 m. Planul hărții este `defaultGroundM`, deci o hartă cu alt plan de bază trebuie să îl declare. Proba este headless; feel-ul ieșirii, animația `exit-vehicle` și validarea în browser rămân la integrarea 196.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '196' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-11-14T22:28:38.459+02:00: Implementarea a început pe branch-ul `loop-pbi/v3-exit-196-01`; fișierul a fost mutat fizic în In Progress, iar boardul a trecut validatorul.

- 2026-11-14T22:51:34.261+02:00: 196 ÎNCHIS în Done. Contractul `196-exit-vehicle-v1` livrează alegerea deterministă a punctului de ieșire (flancuri → spate → față, inel secundar la 0,60 m), refuzuri per candidat (`SOLID`, `OTHER_VEHICLE`, `STEP_TOO_HIGH`, `BELOW_MAP`) și `NO_VALID_EXIT` fără teleportare; criteriul 1 este dovedit numeric (penetrare 0, marjă 0,0500 m, 13/13 candidați cu collider refuzați de 192), criteriul 2a prin arbitrajul real 193 (vehicul 0 comenzi după tranziție, `INACTIVE_CONSUMER_REFUSED`, `DOUBLE_DELIVERY_REFUSED`, `DOUBLE_EXIT_REFUSED`) și criteriul 2b prin restaurarea bit-identică a rutei de dinainte de preluare (LEARNING → MANUAL → AUTO pentru taxi). Camera reia tranziția existentă de 18/18 tick-uri. Verificări: typecheck/lint/format/architecture/catalog exit 0, `npm test` 3349/3349, raport 12/12 PASS, digest `419c5643fe21039781692ccc69bda3594330ac82044c594e6f3d4c2d4b75d0c`.
