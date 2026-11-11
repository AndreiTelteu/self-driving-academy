---
id: "141"
title: "Replay vizual din stări înregistrate"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["140","014","207"]
owner: "loop-pbi/replay-141-01"
started_at: "2026-11-11T21:50:19+02:00"
completed_at: "2026-11-11T22:33:13+02:00"
---

# 141 Replay vizual din stări înregistrate

## Obiectiv

Redă stări și evenimente fără a recalcula politica.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 140 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Recorderul poate reda incidente exclusiv AUTO și vehicule nevizibile, inclusiv create/eliminate.
- [x] Seek și replay nu modifică profilul, revenue, ratings, misiunile sau XP; lipsa datelor este declarată.

## Verificare

Testează seek la incident, pauză și vehicul eliminat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `141-experiment-replay-v1` din `src/experiments/experiment-replay.ts` proiectează un clip sigilat 207 ancorat pe snapshotul 206 fără să recalculeze politica sau fizica (`rerunsPolicy: false`, `recalculatesPhysics: false`, `writesLiveState: false`, `learningArtifacts: 0`). Readerele reale 207 (`readWorldReplayChunk`, `readReplaySample`) sunt injectate prin porturi, deci modulul de domeniu nu importă adaptorul de replay. Incidentul redat este `COLLISION` la tickul 400 între `taxi-02` și `taxi-03`, ambele `AUTO` și ambele în afara camerei (`autoOnly: true`, `visibility: OUTSIDE_CAMERA`, `invisible: true`, `classifiedFromTick: 399`). Fereastra fixată 340..520 are 60 de eșantioane observate (342..519) și 41 de cadre redate. `civil-01` este creat la tickul 380 (prima linie observată 381), iar `civil-03` este eliminat la tickul 406: după eliminare nu mai apare în niciun cadru (0 reînvieri), iar `poseAt(406)` este `ABSENT/ENTITY_REMOVED`. Seek-ul implicit la incident aterizează pe ultimul rând observat 399, raportează `requestedTick: 400`, `landedTick: 399`, `exact: false`, fereastra cerută/stocată și absența declarată `TICK_NOT_OBSERVED 400..400`. Pauza schimbă doar flagul: tick, index, cadru byte-identic, iar `play()` în pauză răspunde `PAUSED` cu `advancedTicks: 0`. Imutabilitatea este dovedită pe fiecare operație (`SEEK`, `PAUSE`, `RESUME`, `SEEK`, `PLAY`, `REPLAY`) cu portul canonic 140 (learning 093, rewards 125 + XP 122, kpi 137 + venit/rating 209) și cu checksum-ul canonic de profil: toate amprentele rămân identice, `liveWrites: 0`; probele de control arată că o scriere reală de venit schimbă doar digestia `kpi`, iar activarea altui profil schimbă checksum-ul. Lipsa datelor este declarată prin vocabular închis: clipul sigilat devreme este `PARTIAL` cu `CAPTURE_FINALIZED_EARLY` și intervalul lipsă 431..520, iar captura cu gol raportează `TICK_NOT_OBSERVED 441..468`, fără interpolare peste gol (poza `poseAt(455)` este `ABSENT`). Interpolarea se face numai între rânduri observate adiacente și coincide cu helper-ul 207.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS; `npm run check:architecture` PASS (346 fișiere TypeScript); `npm run check:parameter-catalog` PASS; `npm test` 2 517 teste, 2 517 trecute, 0 eșuate, 0 sărite (84,6 s); `node --import ./scripts/register-typescript.mjs --test "tests/experiments/experiment-replay.test.ts"` 16 teste, 16 trecute; `npm run experiment:replay` 74/74 verificări, 7 probe de refuz, chunk de 129 377 bytes, checksum `ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218`, PASS; `npm run experiment:replay -- --check` „Experiment replay report is current”.

Fișiere și documente actualizate: `src/experiments/experiment-replay.ts` (nou), `src/experiments/index.ts` (export adăugat la finalul listei), `tests/experiments/experiment-replay-fixture.ts` (nou), `tests/experiments/experiment-replay.test.ts` (nou, 16 teste), `tests/experiments/experiment-replay-report.ts` (nou), `scripts/run-experiment-replay-report.mjs` (nou, cu `--check`), `package.json` (`experiment:replay` la finalul blocului `scripts`), `Docs/14-experimente-si-indicatori.md` (secțiune nouă la final), `Docs/Evidence/141-experiment-replay/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: proiecția este de transformări decimate la 20 Hz, nu o redare fizică (`physicsFidelity: false`); nu există încă un renderer Babylon pentru clip — contractul livrează datele, pozițiile, semafoarele, ciclul de viață și absențele declarate pe care un view le poate desena; recorderul ține clipurile în RAM, deci se pot citi doar cele sigilate și păstrate; costul de memorie/timp al proiecției nu este măsurat (PBI fără `performance_checks`, fără lucru pe tick/frame în simularea live).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '141' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-11: Implementare finalizată în `loop-pbi/replay-141-01`: contract `141-experiment-replay-v1`, 16 teste deterministe, raport determinist 74/74 cu 7 probe de refuz, dovezi în `Docs/Evidence/141-experiment-replay/`; toate verificările obligatorii au trecut (2 517 teste).
