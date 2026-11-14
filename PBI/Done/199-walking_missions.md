---
id: "199"
title: "Tutorial și misiuni pentru mers și vehicule"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["198","188"]
owner: "loop-pbi/v3-missions-199-01"
started_at: "2026-11-15T00:11:11+02:00"
completed_at: "2026-11-15T00:42:41+02:00"
---

# 199 Tutorial și misiuni pentru mers și vehicule

## Obiectiv

Adaugă tutorialul de mers, intrare și ieșire fără a bloca flota.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 198 trebuie să existe în Done înainte de începere.
- PBI 188 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Misiunile existente rămân realizabile din perspectiva veche.
- [x] Noile obiective sunt derivate din evenimente de control.

## Verificare

Playtest tutorial și reluarea unei misiuni V1.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `199-walking-tutorial-v1` este livrat în
`src/missions/walking-tutorial.ts` și exportat din `src/missions/index.ts`. Are șase pași, fiecare
avansat de un singur eveniment real: `SELECT_TAXI` (068), `WALK_TO_TAXI` (mișcare 192),
`ENTER_VEHICLE` (195), `BOARD_PASSENGER` (007 `PICKUP`), `FINISH_RIDE` (007 `DROPOFF`) și
`EXIT_VEHICLE` (196). Primul cadru 192 doar înregistrează poziția de referință; pasul de mers
avansează numai dintr-o poziție autoritară diferită. Intrarea și ieșirea sunt acceptate numai din
deciziile reale 195/196, cu modul impus, autoritatea 193 corectă, același număr de entități și
amprenta stării mașinii neschimbată. Un eveniment greșit este refuzat fără să schimbe progresul, un
pas nu se bifează de două ori, iar un fapt rejucat pe tutorialul complet este refuzat. Tutorialul nu
produce learning: zero joburi, zero versiuni de profil, zero demonstrații, zero candidați de
estimator; martorul 198 arată 120 de tick-uri de mers cu 0 segmente și 0 candidați, în timp ce un
segment LEARNING închis produce exact 1 candidat. XP pentru timpul de mers nu este implementat aici și
este raportat explicit ca `NOT_IMPLEMENTED`. `snapshot()` + `parseWalkingTutorialState` oferă starea
serializabilă pentru 200, iar reluarea din mijloc dă același digest ca rularea neîntreruptă.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings;
`npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture`
PASS (409 fișiere TypeScript) cu probele negative PASS; `npm run check:parameter-catalog`
„Parameter catalog is synchronized.”; `npm test` 3392/3392 teste trecute, 0 eșecuri, 1 suită,
112,8 s; testele țintă `tests/missions/walking-tutorial*.test.ts` 17/17; `npm run walking:tutorial`
PASS cu 6/6 pași, 30/30 refuzuri negative, 10/10 verificări și digest SHA-256
`sha256:e3c83000985001c76f6f9ebed6a94a8e45067862a8c87a278b2e86c767a3f898`; `npm run walking:tutorial
-- --check` confirmă raportul curent. Snapshot comparativ: catalog 231
`sha256:8b16253fcd4d8792f2f66dc4468cc3614175dc6935af1597b6a3cb97704d6f89`, provocări 188
`sha256:2f1708b5e95ce61c43181f46756f795aec66e427ada1442686124be9b6e7f913`, daily 211
`sha256:62fb673902333d1a9ea3a487676064802c8ebc31ea6fa5e4bc6921a1dd2df052`, acces flotă
`sha256:29eb133a97582c17cab46432d666f5c88c122b2817b8c166e0f7178744716a98` — identice înainte, după
tutorialul complet și după cel abandonat la mijloc; o misiune V1 se finalizează prin tracker-ul real
116 în același snapshot.

Fișiere și documente actualizate: creat `src/missions/walking-tutorial.ts`; modificat
`src/missions/index.ts` (export la final); creat `tests/missions/walking-tutorial-suite.ts`,
`tests/missions/walking-tutorial.test.ts`, `tests/missions/walking-tutorial-report.ts`,
`tests/missions/walking-tutorial-report.test.ts`; creat `scripts/run-v3-walking-tutorial-report.mjs`;
modificat `package.json` (ultimul script `walking:tutorial`); modificat
`Docs/13-misiuni-si-progres.md` (secțiune nouă la final); creat
`Docs/Evidence/199-v3-walking-tutorial/{README.md,report.json,report.md}`.

Limitări sau follow-up: XP pentru timpul de mers rămâne neimplementat (permis de Docs/20, dar nu
simulat aici). Tutorialul este headless: UI-ul, tastatura și HUD-ul rămân ale modulelor existente, iar
proba folosește stări 192 și decizii 195/196 reale, nu un browser. Reluarea este idempotentă pe
progres, nu pe contoarele de dovadă (numărul de observații crește, ca la 117).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '199' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-15: Implementat contractul `199-walking-tutorial-v1` (șase pași din evenimente 068/192/195/196/007), snapshot comparativ pentru flotă și misiuni, martor 198 pentru lipsa learning-ului, raport determinist `walking:tutorial`; toate verificările au trecut.
