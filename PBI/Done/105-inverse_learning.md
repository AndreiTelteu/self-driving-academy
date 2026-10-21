---
id: "105"
title: "Validare inversă pe profile cunoscute"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["104","056"]
owner: "opencode deepseek-v4.1-flash inverse-learning-01"
started_at: "2026-10-21T13:17:31.471Z"
completed_at: "2026-10-21T16:47:02+03:00"
---

# 105 Validare inversă pe profile cunoscute

## Obiectiv

Generează demonstrații și evaluează estimarea pe scenarii independente.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 104 trebuie să existe în Done înainte de începere.
- PBI 056 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toleranțele sunt justificate per parametru și context.
- [x] Parametrii neidentificabili nu primesc estimări precise fictive.

## Verificare

Rulează profile prudent, impulsiv, neregulamentar și mixt.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Harness-ul `105-inverse-learning-v1` definește patru profile cunoscute — prudent, impulsiv, neregulamentar și mixt — cu ținte explicite pentru toate cele 24 de chei M, în intervalele 092, fără chei R. Pentru fiecare cheie există o toleranță proprie `{context, absoluteTolerance, relativeTolerance, justifiedBy}`, cu justificări concrete (cuantizarea tick-ului de 1/60 s, dispersia ferestrei de viteză, împărțirea gap/viteză prin OLS, granularitatea numărului de oportunități, rotunjirile în metri și m/s); nu există o toleranță uniformă implicită. Demonstrațiile sunt generate determinist din seed-uri (`deriveScenarioSeed` + `randomUnit`, fără `Math.random`) în șase scenarii independente — free-flow, following, longitudinal, signalized, stop/yield și lane-change — și intră în estimatorii reali 094–099, nu într-o reimplementare paralelă. Identificabilitatea cere dovezi 093 `READY`, numărul minim de episoade, cel puțin două benzi de viteză pentru cheile care separă gap-ul de time-headway și observații acceptate plus respinse pentru yield/lane. O cheie neidentificabilă returnează `NOT_IDENTIFIABLE` cu `estimate:null` și `interval:null`; o valoare precisă injectată pentru ea este respinsă explicit. Rezultatele reale: cele patru profile au 24/24 chei în toleranță; scenariul cu dovezi sparse are 24/24 neidentificabile, fără valori fabricate; contradicțiile lasă 18 neidentificabile și 6 în toleranță; proba de depășire păstrează 1 eșec real (`speed_delta_urban`, țintă -2, estimare 2, eroare 4, toleranță 0.3), raportat, nu ascuns.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (234 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1570/1570 pass, 0 fail; `npm run learning:inverse` 46/46 verificări, 7 scenarii, overall PASS; `npm run learning:inverse -- --check` „Inverse learning report is current”. Testele țintite 105: 17/17 pass. Raportul conține tabelul complet per cheie cu țintă, estimare, eroare, toleranță, context și status, plus secțiunea „Retained failures”. Dovezi: [report.json](../../Docs/Evidence/105-inverse-learning/report.json), [report.md](../../Docs/Evidence/105-inverse-learning/report.md), [README](../../Docs/Evidence/105-inverse-learning/README.md).

Fișiere și documente actualizate: `src/experiments/inverse-learning.ts`, `src/app/inverse-learning.ts`, `src/experiments/index.ts`, `src/app/index.ts`, `tests/experiments/inverse-learning.test.ts`, `tests/experiments/inverse-learning-report.ts`, `scripts/run-inverse-learning-report.mjs`, `package.json`, `Docs/inverse-learning.md`, `Docs/10-invatarea-stilului.md`, `Docs/README.md` și `Docs/Evidence/105-inverse-learning/`.

Limitări sau follow-up: Observațiile sunt sintetice și deterministe, nu capturi de gameplay sau sesiuni de browser. Nu sunt exercitate worker-ul 103, profile store, publicarea, scrierea ledger-ului, blend-ul 101 sau validarea delta 102; nimic nu este învățat din MANUAL/AUTO. 086 nu are un tip de oportunitate `FOLLOWING`, deci faptele lider/coadă folosesc `GREEN`/`STOP` ca purtători de identitate. Toleranțele sunt valori de calibrare documentate, nu intervale de încredere statistice. Nu se pretinde FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '105' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: patru profile cunoscute, toleranțe justificate per cheie/context, scenarii independente pe estimatorii reali, regulă strictă de neidentificabilitate, 17 teste, raport cu 46 de verificări și un eșec real păstrat. Mutat fizic în Done după validare.
