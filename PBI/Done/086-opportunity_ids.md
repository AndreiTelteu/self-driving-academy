---
id: "086"
title: "Oportunități unice și denominatoare"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["085","006","036","037"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium opportunity-ids-01"
started_at: "2026-10-19T12:04:18+03:00"
completed_at: "2026-10-19T12:51:04+03:00"
---

# 086 Oportunități unice și denominatoare

## Obiectiv

Definește IDs și lifecycle pentru STOP, roșu, verde, yield și lane change.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.
- PBI 036 trebuie să existe în Done înainte de începere.
- PBI 037 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] O oportunitate este numărată o dată, independent de framerate.
- [x] Rezultatele incomplete sunt marcate și nu intră ca succes sau eșec cert.

## Verificare

Testează apropieri repetate, segment închis devreme și semnal schimbat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/telemetry/opportunities.ts`, exportat prin `src/telemetry/index.ts`: cinci tipuri enumerate (STOP, RED, GREEN, YIELD, LANE_CHANGE), identitate deterministă din contractul 006 plus contextul autoritativ (sesiune, worldEpoch, vehicul, incarnation, bandă/intersecție/semnal/mișcare) și un ordinal de apariție, ciclu `ENTERED`/`RESOLVED`/`TRUNCATED` cu vocabular închis de motive (`SUPERSEDED`, `SEGMENT_CLOSED`, `OBSERVATION_LOST`, `SUSPENDED`, `DISPOSED`) și denominatori pe tipuri care separă totalul de subsetul cert (succes/eșec) și de cel incomplet. Magazia este mărginită (32…7168, implicit 4096, plafon derivat 4288 B/înregistrare ≈16,75 MiB < `recorderRamBytes`), refuză explicit peste capacitate, impune un plafon de identitate și își păstrează contoarele cumulative după eliminare și după `dispose()`. Consumă observațiile autoritative 036 (faza mișcării) și 037/053 (flux de evenimente drenat, nu eșantionat) plus vocabularele 038/050/051/052/053; nu decide conformarea. Conflict de contract rezolvat în favoarea proiectului: `Docs/09` fixează stările canonice `ENTERED`/`RESOLVED`/`TRUNCATED`, iar distincțiile cerute în brief (opened/active/incomplete/superseded) trăiesc în `observationCount`/`lastTick` și în `truncationReason`, nu într-o a doua mașină de stări.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **981 teste / 981 pass / 0 fail**, de la 970; include cele 11 teste noi) și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei în worktree temporar la commit-ul integrat: `selfCheck.passed = true` cu **everyTickCount 18 == decisionCadenceCount 18** (nucleul criteriului 1: același scenariu real 036/037 la 60 Hz și la 10 Hz dă exact același set de 18 oportunități cu ID-uri identice), denominatori `18 = 6 cert + 10 incomplet + 2 entered` cu toate cele 10 trunchieri motivate `SUPERSEDED`, memorie `retained 4096 = capacitate`, `retiredTotal 1024`, `estimatedBytesMaximum 17.563.648 B (≈16,75 MiB) < recorderRamBytes 33.554.432 B`, `withinCeiling true` și `disposedCountersZero true`, iar costul adăugat `observeOnlyP95Delta 0,0160 ms/tick` (raportat de subagent 11,5–15,6 µs) cu regiunea JSON separată măsurată. Flacul pre-existent `tests/workers/protocol.test.ts` (latență de anulare 115 ms față de ținta de 100 ms), observat și de orchestrator la recuperarea 069, este consemnat în dovezi ca atare: fișierul e neatins de 086, trece izolat, iar suita completă a trecut 981/981 în mai multe rulări.

Fișiere și documente actualizate: `src/telemetry/opportunities.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/opportunity-ids.test.ts` (nou), `scripts/benchmark-opportunity-ids.mjs` (nou), `Docs/opportunity-ids.md` (nou), `Docs/09-telemetrie-si-oportunitati.md`, `Docs/README.md`, `Docs/Evidence/086-opportunity-ids/` (README, checks, tests, ambele brațe native).

Limitări sau follow-up: probă nativă CPU/memorie deținută doar; fără browser/renderer/GPU/FPS, gate-ul jocului integrat rămâne nevalidat, iar `frame` nu este declarat. Registrul nu este încă legat în bucla live de tick; cablarea rămâne la 090/222 și la bridge-ul 069. Fixture-ul 044 nu are linie STOP și nu rulează producători 038/053, deci acele apariții au fost injectate cu contractul și identitatea reale ale producătorilor (suitele folosesc 036 și 037 reale). `lastTick`/`observationCount` reflectă legitim cadența consumatorului; identitatea nu. O apariție de fază mai scurtă decât perioada consumatorului ar fi ratată dacă apelantul nu livrează fluxul — regula de drenare este documentată și asertată pe un lanț real cu faze de 1 s. `estimatedBytes` este contor derivat de proprietate, nu heap exact și nu RAM totală.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '086' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia Telemetrie (085). Owner `opencode deepseek-v4.1-flash medium opportunity-ids-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat registrul de oportunități, testele, proba nativă și documentația, cu commit-uri incrementale (`65bfaf16`, `80df70ac`, `0150f205`, `73061869`, `f818c75e`, `03c8eb7b`, `9e61a256`, `e568e8ed`, `3db978ef`); integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 981/981; catalog sincronizat) și ambele brațe ale sondei 086 (18 = 18 oportunități, memorie mărginită, cost adăugat reprodus); criterii bifate, dovezi completate, mutare fizică In Progress → Done.
