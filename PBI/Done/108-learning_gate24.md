---
id: "108"
title: "Validarea celor 24 de parametri învățabili"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["107"]
owner: "opencode deepseek-v4.1-flash learning-gate24-01"
started_at: "2026-10-21T15:55:26.627Z"
completed_at: "2026-10-21T19:14:04+03:00"
---

# 108 Validarea celor 24 de parametri învățabili

## Obiectiv

Închide gate-ul V1 numai după teste comportamentale pentru toate cheile M.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 107 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie M are estimator, oportunitate și scenariu independent verificat.
- [x] Lista cheilor nevalidate este goală sau gate-ul rămâne deschis.

## Verificare

Produce raportul de acoperire pentru 24 de chei.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Gate-ul `108-learning-gate24-v1` construiește matricea de acoperire din exporturile reale, nu dintr-o listă scrisă de mână: cele 24 de chei M din registrul 092 (`implemented`/`estimable`), specificațiile 093 (canal, contexte, unitate), proprietarul estimatorului din seturile reale 094–099, tipurile de oportunitate 086 și rezultatele scenariilor independente 105 plus acoperirea contextuală 107. Fiecare cheie este validată numai dacă are estimator, specificație de dovezi, cel puțin o oportunitate, un rezultat de scenariu independent și acoperire 107; lipsurile produc motive închise (`NO_ESTIMATOR`, `NO_EVIDENCE_SPEC`, `NO_OPPORTUNITY`, `NO_SCENARIO`, `SCENARIO_FAILED`, `NO_EDGE_CASE`, `DUPLICATE_OWNER`). Rezultatul real este **CLOSED, 24/24 validate, 0 nevalidate**: 6 proprietari 094–099, 7 canale 093, 2 contexte, 96 de rezultate 105 (24 chei × 4 profile, toate în toleranță) și 13 cazuri 107. Sunt 12 chei cu oportunitate `DEDICATED` (semnal/STOP/YIELD/lane) și 12 cu rol `CARRIER` (`GREEN`, respectiv `STOP` pentru coada oprită), deoarece 086 nu are un tip dedicat pentru free-flow/following; rolul este afișat în fiecare rând, numărat separat și documentat, nu ascuns. Gate-ul rămâne `OPEN` cu lista exactă dacă orice element lipsește; testele injectează fiecare lipsă, un proprietar duplicat, o cheie străină și o a 25-a cheie. Zero publicări, scrieri în store sau mutații de flotă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (240 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1622/1622 pass, 0 fail; `npm run learning:gate24` 48/48 verificări, 7 scenarii, gate CLOSED, unvalidated 0, overall PASS; `npm run learning:gate24 -- --check` „Learning gate24 report is current”. Testele țintite 108: 17/17 pass. Semnătura raportului: `fnv1a64:a7dc00cd4e0dbc08`. Dovezi: [report.json](../../Docs/Evidence/108-learning-gate24/report.json), [report.md](../../Docs/Evidence/108-learning-gate24/report.md), [README](../../Docs/Evidence/108-learning-gate24/README.md).

Fișiere și documente actualizate: `src/experiments/learning-gate24.ts`, `src/app/learning-gate24.ts`, `src/experiments/index.ts`, `src/app/index.ts`, `tests/experiments/learning-gate24.test.ts`, `tests/experiments/learning-gate24-report.ts`, `scripts/run-learning-gate24-report.mjs`, `package.json`, `Docs/learning-gate24.md`, `Docs/10-invatarea-stilului.md`, `Docs/README.md` și `Docs/Evidence/108-learning-gate24/`.

Limitări sau follow-up: Acoperirea 107 este la nivel de context: un caz 107 care observă contextul cheii acoperă contextul, dar nu estimează singur cheia; verificarea independentă per cheie rămâne 105. Inputurile 105/107 sunt fixture-uri sintetice deterministe, nu gameplay capturat; nu se pretinde browser, FPS, GPU sau hardware. Harness-ul citește rezultatele 105 și nu rulează estimatoarele, worker-ul 103, blend-ul 101 sau validarea delta 102. `CLOSED` certifică doar acest gate de acoperire pe 24 de chei; nu certifică performanța gameplay integrat și nu înlocuiește gate-urile 220/224.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '108' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: matrice de acoperire din exporturi reale pentru 24 de chei M, gate CLOSED 24/24 fără chei nevalidate, rol dedicated/carrier explicit, teste pentru fiecare lipsă și raport cu 48 de verificări. Mutat fizic în Done după validare.
