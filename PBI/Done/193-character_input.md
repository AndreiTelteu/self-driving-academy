---
id: "193"
title: "Autoritate input la personaj sau mașină"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["192","066","080"]
owner: "loop-pbi/v3-input-193-01"
started_at: "2026-11-14T20:48:56+02:00"
completed_at: "2026-11-14T21:06:40+02:00"
---

# 193 Autoritate input la personaj sau mașină

## Obiectiv

Extinde arbitrajul pentru personaj și vehicul.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 192 trebuie să existe în Done înainte de începere.
- PBI 066 trebuie să existe în Done înainte de începere.
- PBI 080 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] O singură entitate primește comenzile jucătorului.
- [x] Tastele păstrate la tranziție nu produc accelerație accidentală.

## Verificare

Testează mers–mașină și schimbarea focusului.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `193-input-authority-v1` trăiește în `src/input/authority-arbiter.ts`. `step({ tick, characterYawRad })` produce exact o comandă discriminată — `WalkerInput` (192) pentru `CHARACTER`, `VehicleCommand` (024) pentru `VEHICLE` — iar `deliver(result, consumer, ports)` este singurul canal către consumatori. Livrarea dublă în același tick este refuzată cu `DOUBLE_DELIVERY_REFUSED`, livrarea către entitatea inactivă cu `INACTIVE_CONSUMER_REFUSED`, iar un rezultat vechi cu `STALE_RESULT`. Pentru tastele ținute la tranziție a fost aleasă regula neutralizării până la prima eliberare: `setAuthority` marchează toate acțiunile ținute ca neutralizate, o reapăsare fără eliberare nu le reactivează, iar eliberarea urmată de reapăsare readuce intenția exact la comanda de referință. Focusul este refolosit din 066: `port` este exact `KeyboardDrivePort`, deci `bindKeyboardDriveInput` alimentează arbitrajul cu intenții deja filtrate. Starea (`version`, `tick`, `authority`, `held`, `neutralized`, `transitions`, 169 B) este JSON simplu, validată strict la `restore`, cu tastele ținute neutralizate la reluare pentru salvarea din 200.

Verificări executate și rezultat: `npm run typecheck` PASS (0 erori); `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS; `npm run check:architecture` PASS (403 fișiere TS, probe negative 6 + 4 + 3); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` 3310/3310 teste trecute, 0 eșecuri, 1 suită, 110.991 s; `node --import ./scripts/register-typescript.mjs --test "tests/input/authority-*.test.ts"` 20/20; `npm run authority:report` verdict general PASS (scenarii 13/13, combinații exhaustive 256 × 2 = 512 tick-uri cu 512/512 consumatori adresați, 0 tick-uri cu comandă non-vidă la ambele entități, 0 livrări la entitatea inactivă, tranziții 18/18 cu primul tick vid, focus PASS, serializare PASS, determinism 2 rulări identice, SHA-256 `9e31131be1109d754939d528961914c26c72942f9ff7ba8544735387c4bad418`); `npm run authority:report -- --check` raportează raport curent.

Fișiere și documente actualizate: `src/input/authority-arbiter.ts` (nou), `src/input/index.ts` (export), `tests/input/authority-arbiter.test.ts`, `tests/input/authority-focus.test.ts`, `tests/input/focus-fixture.ts`, `tests/input/authority-suite.ts`, `tests/input/authority-report.test.ts` (noi), `scripts/run-v3-authority-report.mjs` (nou), `package.json` (o intrare nouă, ultima din `scripts`: `authority:report`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiune de contract la final), `Docs/Evidence/193-v3-authority/` (`README.md`, `report.json`, `report.md`).

Limitări sau follow-up: walker-ul 192 are doar mers înainte, deci axa negativă comandă oprirea, nu mers înapoi; virarea personajului este o direcție absolută derivată din fețarea curentă (±π/2), urmărită de walker cu limita lui de 12 rad/s; arbitrajul nu citește tastatura, focusul fiind garantat de legarea 066; comutarea autorității rămâne o decizie a compoziției (195 pentru intrarea în mașină, 194 pentru cameră); persistarea efectivă aparține PBI 200; proba este headless, fără cameră third-person și fără măsurarea latenței percepute.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '193' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14: implementat în worktree-ul `loop-pbi/v3-input-193-01`; contract `193-input-authority-v1` cu un singur consumator per tick, refuz explicit al livrării duble, neutralizare până la prima eliberare pentru tastele ținute la tranziție, focus refolosit din 066 și stare serializabilă pentru 200; verificări complete trecute, raport determinist `authority:report`.
