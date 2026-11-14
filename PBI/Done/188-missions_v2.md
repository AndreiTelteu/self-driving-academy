---
id: "188"
title: "Provocări pentru comportamentele extinse"
status: "Done"
release: "V2"
module: "Misiuni V2"
depends_on: ["187","125"]
owner: "loop-pbi/v2-missions-188-01"
started_at: "2026-11-14T03:49:43+02:00"
completed_at: "2026-11-14T04:20:58+02:00"
---

# 188 Provocări pentru comportamentele extinse

## Obiectiv

Adaugă provocări de pietoni, rutare, semnalizare, pericole și serviciu.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 187 trebuie să existe în Done înainte de începere.
- PBI 125 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Provocările furnizează contextele pentru noile chei și explicațiile lor.
- [x] Progresul V1 și accesul la vehicule sunt păstrate.

## Verificare

Playtest provocările și importul progresului V1.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/extended-challenges.ts` oferă schema `188-extended-challenges-v1` și catalogul `188-extended-challenge-catalog-v1` cu 15 provocări (3 per familie) pentru pietoni, rutare, semnalizare, pericole și serviciu. Fiecare provocare declară exact o cheie reală din cele 56 V2 ale tabelului 187 și un prag derivat din ea printr-o derivare închisă; unitatea cheii din catalog trebuie să coincidă cu unitatea faptului măsurat. Evaluatorii sunt puri peste fapte reale de 60 Hz (traversări, decizii de rută, recuperări, oportunități de semnalizare, treceri de pericole, opriri de serviciu), cu deadline derivat din durata de referință și buget de incidente. Explicațiile sunt legate de evenimente reale de observație. Prerechizitele sunt fail-closed (`SESSION`, `CONTROL`, `VEHICLE_CLASS`, `CAPABILITY`, `LEARNING_KEY`, `CAMPAIGN`). `createComposedChallengeCatalog()` publică 12 template-uri 231 neschimbate + 15 provocări extinse = 27, fără ID-uri comune.

Verificări executate și rezultat:
- `npm run typecheck` — PASS.
- `npm run lint` — PASS, 0 warnings.
- `npm run format:check` — PASS („All matched files use Prettier code style!”).
- `npm run check:architecture` — PASS (391 fișiere TypeScript; probele negative 6/4/3 trec).
- `npm run check:parameter-catalog` — PASS („Parameter catalog is synchronized.”).
- `npm test` — 3250 teste, 3250 trecute, 0 eșecuri, 1 suită, 109,8 s.
- Teste țintă `tests/missions/extended-challenges.test.ts` + `extended-challenges-report.test.ts` — 16 teste, 16 trecute.
- `npm run missions:challenges-v2` — 40/40 verificări, 15 provocări, 5 familii, 15/56 chei V2 acoperite, 12 template-uri 231, catalog compus 27, digest `fnv1a32:a043542d`, overall PASS.
- `npm run missions:challenges-v2 -- --check` — raportul JSON și Markdown sunt curente.
- Compatibilitate V1 dovedită prin instantaneu înainte/după ce rulează tot codul 188: catalog 231 `fnv1a32:9714302b`, progres campanie `fnv1a32:7f45fc70`, deblocări `fnv1a32:0da1f677`, acces vehicule `fnv1a32:bdd636b4` (64/64 conduse, 24/24 taxiuri selectabile, 0 revocări, 0 taxiuri blocate), `PlayerProgress` `fnv1a32:8646bf48`, checkpoint importat `fnv1a32:92f67b0f`; valorile rămân identice după import.

Fișiere și documente actualizate: `src/missions/extended-challenges.ts` (nou), `src/missions/index.ts` (export la final), `tests/missions/extended-challenges.test.ts`, `extended-challenges-fixture.ts`, `extended-challenges-report.ts`, `extended-challenges-report.test.ts` (noi), `scripts/run-v2-challenges-report.mjs` (nou), `package.json` (o singură intrare nouă, ultima: `missions:challenges-v2`), `Docs/13-misiuni-si-progres.md` (secțiune nouă la final), `Docs/Evidence/188-v2-challenges/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: catalogul livrat acoperă 15 dintre cele 56 de chei V2; cele 41 rămase sunt raportate explicit în `report.json` (`learningKeys.uncovered`). Pragurile sunt derivate din valorile reale ale catalogului și din podelele politicilor livrate, dar calibrarea de joc rămâne o propunere până la playtest. Programarea ofertelor, ciclul de viață, XP-ul și istoricul de reluare rămân la 233. Verificarea este deterministă pe fapte de tick și nu înlocuiește un playtest uman.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '188' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14: Implementare finalizată pe `loop-pbi/v2-missions-188-01`; 15 provocări în 5 familii, catalog compus 27, 40/40 verificări, suita completă 3250/3250, progres V1 și acces vehicule identice înainte/după.
