---
id: "144"
title: "Experimente în worker progres și anulare"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["143","010","221"]
performance_checks: ["workers", "memory", "frame"]
owner: "loop-pbi/exp-worker-144-01"
started_at: "2026-11-11T23:20:51+02:00"
completed_at: "2026-11-12T02:53:24+02:00"
---

# 144 Experimente în worker progres și anulare

## Obiectiv

Rulează loturi cu progres, limită de resurse și anulare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 143 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] UI rămâne operabil și rezultatele parțiale sunt etichetate.
- [x] Un model simplificat nu este prezentat drept aceeași fizică fără validare.

- [x] Loturile sunt admise prin 221, au felii de lucru și o singură lume activă conform bugetului; learning-ul poate întrerupe un lot cooperativ.

## Verificare

Testează lot lung, anulare și eroare de worker.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `144-experiment-worker-v1` rulează loturi cu felii, progres incremental, anulare cooperativă și întrerupere de learning. Lotul este o listă de celule de rulare (un seed pe felie); fiecare felie este un job `optional` de operație `comparison` trimis coordonatorului comun 221 (`WorkerResourceGovernor`), cu refuz explicit și contorizat (`CAPACITY_INSUFFICIENT`, `SESSION_SUSPENDED`, `STALE_ADMISSION`), o singură lume activă (`WORLD_RESERVED`) și bugete citite din `Docs/performance-budgets.json`. Progresul este raportat după fiecare felie (`0,1,2,3,4,5` pentru 5 felii), anularea se oprește la granița de felie și păstrează rândurile ca `PARTIAL` cu motiv, iar learning-ul pauzează/relua lotul la graniță și este și preemptat de 221 (`preempted`, `cancellationMs`). Un model `SIMPLIFIED` raportează structural `physicsFidelity: false` și un disclaimer, iar o pretenție de fidelitate este refuzată cu `SIMPLIFIED_CLAIMS_FIDELITY`. Dovezi: [Docs/Evidence/144-experiment-worker](../../Docs/Evidence/144-experiment-worker/README.md) și [Docs/14](../../Docs/14-experimente-si-indicatori.md) (secțiunea 144).

Verificări executate și rezultat: `npm run typecheck` PASS (ambele configurații, fără erori); `npm run lint` PASS (0 erori, 0 warnings); `npm run format:check` PASS („All matched files use Prettier code style!”); `npm run check:architecture` PASS (`Architecture imports: PASS (355 TypeScript files)` + 6 + 4 + 3 sonde negative); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` PASS — 2607 teste, 2607 trecute, 0 eșuate, 69 048 ms; testele țintă `tests/experiments/experiment-worker.test.ts` PASS — 22/22, 1 383 ms; `npm run experiment:worker` PASS — 73/73 verificări, 10 scenarii, `report.json` + `report.md`; `npm run experiment:worker -- --check` PASS („Experiment worker report is current”, byte-identic la două rulări); `npm run experiment:worker -- --cost --samples 5` — 15 felii, cost 24,449/25,458/29,699 ms (min/median/max), 15/15 peste bugetul de 10 ms, lot 77,46/77,685/88,158 ms. Lot real prin 221: 3 rânduri, 72 de decizii, 31 diferențe (27 de prag, 4 de geometrie), 0 refuzuri pe calea normală; 1 refuz 221 contorizat; 1 preempțiune de learning; 4 lacune de manifest raportate.

Fișiere și documente actualizate: `src/experiments/experiment-worker.ts` (nou), `src/experiments/experiment-worker-governor.ts` (nou), `src/experiments/index.ts` (două exporturi la final), `tests/experiments/experiment-worker-harness.ts` (nou), `tests/experiments/experiment-worker.test.ts` (nou), `tests/experiments/experiment-worker-report.ts` (nou), `scripts/run-experiment-worker-report.mjs` (nou), `package.json` (`experiment:worker`, ultima intrare din `"scripts"`), `Docs/14-experimente-si-indicatori.md` (secțiunea contractului), `Docs/Evidence/144-experiment-worker/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md` (noi).

Limitări sau follow-up: Nivel `targeted` (politica 2026-10-08), fără browser real, GPU sau hardware țintă. O felie este o celulă de rulare 142 atomică de ~25 ms, peste bugetul de 10 ms al manifestului: depășirea este raportată per felie (`overBudget`, `stepMs`), nu ascunsă, iar felii sub 10 ms cer ca 142 să expună o evaluare incrementală. Stiva 221 din dovezi rulează în același proces, peste un transport care livrează pe macrotask (protocol, admitere, priorități și preempțiune reale; izolarea de thread nu este măsurată). Memoria este raportată ca proprietate (payload, contoare de joburi), nu ca heap: `totalHeapBytes`, `wasmBytes`, `queueCountAndAge` și `additionalSuballocations` rămân lacune declarate. Nu se pretinde FPS; „UI operabil” este dovedit structural (mesaje, `await` între felii) și printr-un test care arată că bucla apelantului rulează între felii.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '144' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-11: Preluat pe branch-ul `loop-pbi/exp-worker-144-01`; status In Progress.
- 2026-11-12: Implementat contractul `144-experiment-worker-v1` cu admitere prin 221, felii cu buget, progres incremental, anulare cooperativă, pauză/reluare de learning și eticheta `SIMPLIFIED`; 22 de teste țintă, raport determinist 73/73 și probă de cost. Mutat fizic în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
