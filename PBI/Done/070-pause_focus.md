---
id: "070"
title: "Pauză focus și modalitate de input"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["069","012"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium pause-focus-01"
started_at: "2026-10-19T10:44:19+03:00"
completed_at: "2026-10-19T11:26:16+03:00"
---

# 070 Pauză focus și modalitate de input

## Obiectiv

Implementează comportamentul panourilor, meniului și focusului.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 012 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Panelurile suspendă simularea în manual și pot fi live în observare AUTO.
- [x] Reluarea resetează comenzile ținute și nu avansează timpul pierdut.

## Verificare

Testează alt-tab, panel și meniu în ambele moduri.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/app/pause-focus.ts` (deținător unic al deciziei de suspendare, `070-pause-focus-v1`) plus `src/input/pause-focus-input.ts` (adaptor de focus cu 4 listeneri și notificări edge-triggered). Panourile suspendă în MANUAL/LEARNING (cauză `panel`) și rămân live în observare AUTO fără a revendica locul PLAYER; meniul suspendă în toate modurile (`menu`); diagnosticul read-only nu suspendă niciodată. Precedența este fixă `focus > menu > panel`, iar schimbarea doar a cauzei nu produce o nouă tranziție. `pause(reason)` din 012 acceptă acum și cauzele gazdă `focus|menu|panel`, păstrate în starea observabilă și mapate pe pauza `manual` a 008 (doar `background` rămâne distinct). Reluarea — inclusiv `requestResume()`, refuzat cât timp o suprafață cere suspendarea — resetează comenzile ținute (set mărginit de 16, acțiunea de panou ținută și portul `resetHeldCommands` pentru filtrul 025) și reancorează ceasul: niciun timp oprit nu devine tick, iar secvența de tick-uri rămâne contiguă. Composition root-ul leagă blur/focus real de deținător și trece butonul de reluare prin `requestResume()`.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **961 teste / 961 pass / 0 fail**, de la 951; include cele 10 teste noi din `tests/app/pause-focus.test.ts`), `npm run check:parameter-catalog` EXIT 0 și, suplimentar față de lista cerută subagentului, `npm run build` EXIT 0 (build-ul de producție trece deși `src/main.ts` importă acum `./input`, ceea ce typecheck-ul singur nu acoperea). Orchestratorul a **re-rulat independent ambele brațe** ale sondei (`node --import ./scripts/register-typescript.mjs scripts/benchmark-pause-focus.mjs --baseline`, apoi fără flag, la commit-ul integrat) și a reprodus concluzia: `selfCheck.passed = true` în ambele brațe, 10000 de tick-uri pe brațul live și **0 tick-uri cât timp e suspendat** în timp ce randările continuă (10001), 2000 de muchii de tranziție cu 1000 suspendări / 1000 reluări / 1000 resetări de comenzi ținute, `ticksWhileSuspended 0`, secvență `contiguous` și `distinctTicks`, p50/p95/p99 **3,5 / 3,9 / 7,6 µs per muchie**, citire `getState()` p95 0,3 µs, iar memoria: 20 de cicluri toate eliberate, capacitate 16 comenzi ținute, 0 typed arrays reținute, 0 bytes prealocați. Bugetele rămân PROVISIONAL_UNCALIBRATED; costul adăugat per muchie este ~0,07 % din plafonul provizoriu de 5,5 ms al tick-ului, iar brațul suspendat elimină practic tot lucrul fixture-ului.

Fișiere și documente actualizate: `src/app/pause-focus.ts` (nou), `src/app/application-lifecycle.ts`, `src/app/index.ts`, `src/input/pause-focus-input.ts` (nou), `src/input/index.ts`, `src/main.ts`, `tests/app/pause-focus.test.ts` (nou), `scripts/benchmark-pause-focus.mjs` (nou), `Docs/pause-focus.md` (nou), `Docs/08-interfata-camera-si-control.md`, `Docs/app-lifecycle.md` (o frază, pentru vocabularul de cauze extins al lui 012), `Docs/README.md`, `Docs/Evidence/070-pause-focus/`.

Limitări sau follow-up: **proba UI/frame nu este măsurată** — nu există browser vizibil în acest mediu, iar 052 documentează stall-ul WebGPU de pe acest laptop; costul Babylon/GPU, p95/p99 real de cadru, latența input→comandă și comportamentul vizual alt-tab rămân nevalidate și sunt datorate la 153/224/235, conform regulii din Docs/25 că un cost imposibil de măsurat nu este declarat acceptat. Fixture-ul este CPU Node (renderer mock, snapshot = contor de tick) și nu închide nicio linie de buget absolută; brațul BEFORE este același commit cu calea 070 dezactivată, nu o revizie istorică. Panourile de flotă, KPI, profil, misiuni și reglaje, precum și camera/pointer lock aparțin 074/075/229/017 și nu sunt implementate aici. Consumatorul corect al semanticii de pauză este 087 (vocabularul de excludere `PAUSE`/`FOCUS_LOST`), nu recorder-ul 085, care doar nu vede tick-uri cât timp e suspendat și își păstrează `tickGaps` 0.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '070' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia Control manual (066/069). Nu s-a declarat `frame`: costul de frame/UI nu poate fi măsurat în acest mediu (fără browser vizibil; 052 documentează stall-ul WebGPU), iar Docs/25 spune explicit că un cost imposibil de măsurat nu este declarat acceptat — proba de UI rămâne pentru 153/224/235 și este consemnată ca limitare. Owner `opencode deepseek-v4.1-flash medium pause-focus-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat deținătorul deciziei de suspendare, adaptorul de focus, integrarea în composition root și testele, cu commit-uri incrementale (`431f6582`, `6ab8a48e`, `14f6a469`, `b4a8a8a1`, `e91972b2`, `c2ee8c16`, `4f188d0e`); integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 961/961; catalog sincronizat; `npm run build` EXIT 0) și ambele brațe ale sondei (invariantele de pauză și secvența de tick-uri reproduse); criterii bifate, dovezi completate, mutare fizică In Progress → Done.

- 2026-10-19: Notă de context: livrarea 069 a fost recuperată în `main` chiar înainte de acest PBI, deci integrarea cu lifecycle-ul real de segmente manuale a fost posibilă fără un contract paralel inventat.
