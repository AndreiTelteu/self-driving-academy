---
id: "191"
title: "Personaj animații și reprezentare"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["190","150"]
owner: "loop-pbi/v3-character-191-01"
started_at: "2026-11-14T19:14:39+02:00"
completed_at: "2026-11-14T19:45:00+02:00"
---

# 191 Personaj animații și reprezentare

## Obiectiv

Livrează personaj cu mers, alergare, idle și interacțiune auto.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 190 trebuie să existe în Done înainte de începere.
- PBI 150 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Assetul are pivoturi și scări compatibile cu orașul.
- [x] Animarea nu rescrie poziția autoritară.

## Verificare

Inspectează animațiile și contactul cu solul.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `191-character-v1` este livrat în `src/character/` (schelet cu 17 articulații și pivoturi, scară măsurată de 1.780 m înălțime / 1.645 m ochi / 1.780 m anvergură, cinci clipuri in-place eșantionate la 60 Hz, contact cu solul măsurat prin cinematică directă, poziție autoritară exclusiv ca input). Reprezentarea Babylon `191-character-visuals-v1` este derivată din contract în `src/rendering/character-visuals.ts`. Admiterea numerică are 9 verificări față de trotuarul de 2.40 m, bordura de 0.14 m, banda de 3.40 m și sedanul 145/023 (plafon 1.65 m deasupra solului, prag 0.54 m, cabină 1.51 m). Assetul implicit este acceptat; un asset de 2.581 m este refuzat cu `HEIGHT_OUT_OF_RANGE`/`DOOR_TOO_LOW`, un trotuar de 0.90 m cu `SIDEWALK_TOO_NARROW`, iar o declarație mincinoasă de scară cu `DECLARATION_MISMATCH`. Poziția autoritară rămâne bit-identică în toate cele 309 cadre verificate (inclusiv wrap și tick-uri mari), iar scrierea ei prin animație este refuzată explicit (`AUTHORITY_WRITE_REFUSED`, `POSE_CONTAINS_ENTITY_POSITION`, `ROOT_MOTION_IN_CLIP`). Contactul: cel mai de jos punct rămâne în `-2.64e-16…1.80e-16` m față de toleranța de 0.004 m, `walk` 48/48 cadre cu sprijin, `run` 30/30, `idle` ambele tălpi 120/120.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 warnings); `npm run format:check` PASS; `npm run check:architecture` PASS (399 fișiere TypeScript, probe negative 6/4/3 PASS); `npm run check:parameter-catalog` PASS; `npm test` 3272 teste, 3272 pass, 0 fail (111.831 s); testele țintă `tests/character/*.test.ts` 22 pass, 0 fail (1.469 s); `npm run character:report` verdict PASS, determinism 2 rulări identice, SHA-256 `e713aecda0fc8f8c1ed6add649fcff7547e8aee1bc9d986ca850a6518811895a`; `npm run character:report -- --check` confirmă raportul curent (exit 0).

Fișiere și documente actualizate: `src/character/{errors,skeleton,clips,ground,asset,authority,index}.ts` (modul nou); `src/rendering/character-visuals.ts` (nou) și exportul din `src/rendering/index.ts`; `tests/character/{world-reference,character-suite,character-assets.test,character-animation.test,character-ground-contact.test,character-visuals.test,character-report.test}.ts`; `scripts/run-v3-character-report.mjs`; `package.json` (`character:report`, ultima intrare); `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă); `Docs/Evidence/191-v3-character/{README.md,report.json,report.md}`.

Limitări sau follow-up: Verificarea este headless, fără browser; proba vizuală WebGPU/WebGL2 rămâne la integrarea personajului în 192. Reprezentarea este un contract de cutii pe pivoturi, nu un skin/GLB final. Deplasarea autoritară, coliziunile, camera și tranziția personaj ↔ vehicul aparțin PBI 192. Toleranța de 0.004 m acoperă eroarea numerică, nu o alegere artistică.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '191' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14: Implementare completă în worktree-ul `v3-character-191-01`; contract de asset, clipuri, contact cu solul, reprezentare și raport determinist livrate; toate verificările obligatorii au trecut.
