---
id: "195"
title: "Intrarea în orice mașină din proximitate"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["194","068"]
owner: "loop-pbi/v3-enter-195-01"
started_at: "2026-11-14T21:52:07+02:00"
completed_at: "2026-11-14T22:14:02+02:00"
---

# 195 Intrarea în orice mașină din proximitate

## Obiectiv

Definește proximitatea, intenția și punctul de intrare pentru taxiuri și civile.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 194 trebuie să existe în Done înainte de începere.
- PBI 068 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Orice mașină existentă poate fi preluată dacă există acces fizic.
- [x] Intrarea închide alte autorități și păstrează cursa mașinii.

## Verificare

Testează civil, taxi în cursă și punct de acces blocat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `195-enter-vehicle-v1` este livrat în `src/character/enter-vehicle.ts` ca modul pur, headless și fail-closed (fără ceas, DOM, Babylon, `Math.random` sau servicii de simulare), cu export la finalul `src/character/index.ts`. `decideVehicleEntry(request)` primește corpul personajului 192, mașinile cu amprenta 022/145 și starea completă 024/061/057, autoritatea 193 și intenția, apoi întoarce fie acceptarea, fie un refuz cu cod închis. Accesul fizic: ușa este mijlocul flancului cel mai apropiat, distanța planară trebuie să încapă în atingerea de 0,89 m măsurată pe assetul 191 (jumătatea anvergurii brațelor), iar segmentul personaj→ușă este testat cu intersecție exactă împotriva poligoanelor convexe ale lumii 192 și a celorlalte caroserii, cu regula verticală a solverului 192. Refuzuri reale: `OUT_OF_RANGE` (3,0150 m), `PATH_BLOCKED` pe colțul real al clădirii `bld:blk:0-0:0-0` (0,7071 m), pe un obstacol 165 peste ușă (`hazard:obstacle-01`) și pe o altă caroserie (`vehicle:neighbour-195`), `UNKNOWN_VEHICLE`, `VEHICLE_OCCUPIED` (scaunul unic de jucător din 068) și `VEHICLE_UNAVAILABLE` (023 `IMMOBILIZED`); un taxi în cursă este acceptat. Criteriul 2a: autoritatea devine exact `VEHICLE:<id>`, arbitrajul real 193 refuză livrarea către personaj cu `INACTIVE_CONSUMER_REFUSED` și a doua livrare cu `DOUBLE_DELIVERY_REFUSED`, tastele ținute rămân neutralizate, entitățile rămân 2 → 2, corpul personajului este păstrat cu biți identici ai poziției, iar a doua intrare în același tick este `DOUBLE_ENTRY_REFUSED`. Criteriul 2b: toate cele 16 câmpuri păstrate sunt identice, iar amprenta IEEE-754/UTF-8 este egală înainte/după; singurul câmp schimbat este `state.controlMode`, din AUTO sau LEARNING în `MANUAL` (modurile reale 024, fără un al patrulea). Camera 194 primește cererea exactă în același tick: primul cadru raportează deja `entityId` al mașinii și tranziția existentă de 18 tick-uri (17 → 0), cu 0 clonări.

Verificări executate și rezultat: `npm run typecheck` exit 0 (0 erori); `npm run lint` exit 0 (0 erori, 0 warnings); `npm run format:check` „All matched files use Prettier code style!" exit 0; `npm run check:architecture` PASS (405 fișiere TypeScript, probe negative 6 + 4 + 3) exit 0; `npm run check:parameter-catalog` „Parameter catalog is synchronized." exit 0; `npm test` **3334 teste, 3334 trecute, 0 eșuate**, 1 suită, 111 677,5 ms; testele țintă `tests/character/enter-vehicle.test.ts` + `tests/character/enter-vehicle-report.test.ts` **11 teste, 11 trecute, 0 eșuate**; `npm run enter:report` **10/10 scenarii PASS**, criteriu 1 PASS, 2a PASS, 2b PASS, cameră PASS, entități 2 → 2, tranziție cameră 18/18, determinism 2 rulări identice, digest SHA-256 `6af63aee34ce49530e7a250c89c488ed5bfbec06302e429390235736d140ba52`; `npm run enter:report -- --check` raportează „Enter vehicle report is current" și „Enter vehicle markdown is current" exit 0.

Fișiere și documente actualizate: `src/character/enter-vehicle.ts` (nou), `src/character/index.ts` (export la final), `tests/character/enter-vehicle.test.ts`, `tests/character/enter-vehicle-suite.ts`, `tests/character/enter-vehicle-report.test.ts` (noi), `scripts/run-v3-enter-report.mjs` (nou), `package.json` (o singură intrare nouă, ultima din `scripts`: `enter:report`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final), `Docs/Evidence/195-v3-enter/{README.md,report.json,report.md}`.

Limitări sau follow-up: contractul este pur headless și nu creează scenă, cameră Babylon, input sau corpuri; compunerea (066/194/024) aplică decizia în tick-ul curent, iar integrarea în bucla reală a jocului rămâne la compoziție. Accesul este planar ca fizica 192: portalele, trapele și ușile deschise nu sunt modelate, iar verticalitatea contează doar prin suprapunerea solidelor cu corpul. Ușa este mijlocul flancului caroseriei, nu un mâner modelat. „Ocupat" este scaunul unic de jucător din 068, nu un al doilea jucător uman. Indisponibilitatea folosește doar regula reală din 023 (`IMMOBILIZED`), pentru că 068 nu are o misiune care să interzică preluarea. Proba este deterministă și headless; feel-ul intrării, animația `enter-vehicle` din 191 și validarea în browser rămân la integrarea 195/196.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '195' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14T21:52:07+02:00: preluat pe branch-ul `loop-pbi/v3-enter-195-01`; status In Progress, owner și started_at completate, fișier mutat fizic în In Progress și boardul validat.
- 2026-11-14T22:14:02+02:00: implementat contractul `195-enter-vehicle-v1` cu acces fizic real (atingere 0,89 m, zid/obstacol/caroserie între, indisponibil 023), autoritate unică dovedită cu arbitrajul 193, stare păstrată bit-identic (doar modul MANUAL) și cameră 194 în același tick; 10/10 scenarii, 3334/3334 teste, fișier mutat fizic în Done și validat cu `-RequireDone '195'`.
