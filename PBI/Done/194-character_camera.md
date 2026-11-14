---
id: "194"
title: "Cameră third person pentru personaj"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["193","017"]
owner: "loop-pbi/v3-camera-194-01"
started_at: "2026-11-14T21:19:35+02:00"
completed_at: "2026-11-14T21:39:01+02:00"
---

# 194 Cameră third person pentru personaj

## Obiectiv

Adaugă urmărire și tranziții cameră între personaj și vehicul.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 193 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Camera evită obstacolele și urmărește entityId potrivit.
- [x] Setările de mișcare rămân accesibile.

## Verificare

Testează apropiere de clădiri și tranziții de cameră.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `194-character-camera-v1` trăiește în `src/character/character-camera.ts` ca modul pur, headless și determinist (fără Babylon, DOM, ceas, `Math.random` sau import de renderer). `step({ tick, authorityEntityId, targets, orbit, obstacles, groundM })` caută exact entitatea autorității din 193: un id necunoscut este refuzat cu `CAMERA_UNKNOWN_ENTITY`, iar o tranziție către aceeași entitate cu decizia explicită `SAME_ENTITY`. Schimbarea autorității pornește o tranziție de exact 18 tick-uri din ultima poziție sigură, cu interpolare `smoothstep`; `frame.entityId` este noua autoritate din primul cadru, iar ținta este citită în loc, fără clonare, înghețare sau scriere (`entityClones = 0`, `targetWrites = 0`). Raza ancoră → cameră este trunchiată la prima cutie AABB umflată cu raza de 0,20 m plus marja de 0,05 m, cu baleierea mișcării, clamp pe limitele hărții, depenetrare deterministă în maximum 8 treceri și fallback la ultima poziție validă; colțul cu ambele axe blocate rămâne valid și stabil. Pitch-ul este clampat la −20°…64,8°, distanța la 2…8 m, camera nu coboară sub solul local + 0,40 m și nu iese din lume. Criteriul 2 refolosește `ControlPreferences` 009 prin `parseControlPreferences`: `cameraMotion` dă factorul de urmărire (1 la 0, 0,625 la 50, 0,25 la 100), `fov` dă câmpul vizual, iar distanța și inversarea axelor rămân intenție explicită de orbită, fără un al doilea store. `snapshot()`/`restore()` serializează versionat orbita, tranziția în curs, `entityId`, `previousEntityId`, poziția, ținta și controlul aplicat.

Verificări executate și rezultat: `npm run typecheck` PASS (src + tests, 0 erori); `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS („All matched files use Prettier code style!”); `npm run check:architecture` PASS (404 fișiere TS, probe negative 6 + 4 + 3 + Rapier); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` 3323/3323 teste trecute, 0 eșecuri, 1 suită, 111.672 s; testele țintă `tests/character/character-camera.test.ts` + `character-camera-report.test.ts` 13/13; `npm run character:camera` verdict general PASS (5/5 scenarii, zid real 1,7856 m din 6 m, sedan 1,7500 m, colț 1,0727 m, clearance minim 0,0500 m, tranziție 18/18 cadre cu deplasare maximă 0,3340 m/tick, setările 009 schimbă camera, serializare 629 B cu 25/25 cadre identice, determinism 2 rulări identice, SHA-256 `da23bead1b80d42a8cc050d0ec7a6c4cbdb542352dddf296c03e1a98657d1290`); `npm run character:camera -- --check` raportează `report.json` și `report.md` curente.

Fișiere și documente actualizate: `src/character/character-camera.ts` (nou), `src/character/index.ts` (export la final), `tests/character/character-camera-suite.ts`, `tests/character/character-camera.test.ts`, `tests/character/character-camera-report.test.ts` (noi), `scripts/run-v3-character-camera-report.mjs` (nou), `package.json` (o singură intrare nouă, ultima din `scripts`: `character:camera`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final), `Docs/Evidence/194-v3-camera/` (`README.md`, `report.json`, `report.md`).

Limitări sau follow-up: contractul este headless și nu creează camera Babylon, mesh-uri, input sau renderer; integrarea vizuală și feel-ul camerei aparțin PBI 195. Obstacolele sunt cutii AABB; amprentele rotite folosesc AABB-ul conservator furnizat de apelant, iar formele concave și portalurile nu fac parte din contract. În timpul unei tranziții camera poate fi temporar mai departe de noua țintă decât `maxDistanceM`, pentru că zboară din ultima poziție sigură; limita de 8 m se aplică orbitei cerute. Dacă un zid desparte complet poziția veche de noua țintă, trunchierea fail-closed oprește camera pe partea sigură în loc să o teleporteze prin zid. Setările 009 nu au astăzi slidere pentru distanță sau inversare de axă; acelea rămân câmpuri explicite de intenție. Proba este deterministă și headless, pe harta și geometria reale, fără playtest vizual în browser.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '194' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14: implementat în worktree-ul `loop-pbi/v3-camera-194-01`; contract `194-character-camera-v1` cu urmărire exactă pe `entityId`, tranziție interpolată pe 18 tick-uri fără clonare, trunchierea razei la primul obstacol cu marjă (inclusiv colțul cu ambele axe blocate), constrângeri de pitch/distanță/sol/lume, refolosirea setărilor 009 și stare serializabilă pentru 200; verificări complete trecute, raport determinist `character:camera`.
