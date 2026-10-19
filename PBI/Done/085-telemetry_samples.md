---
id: "085"
title: "Eșantioane manuale și contexte la tick"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["069","044","025"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium telemetry-samples-01"
started_at: "2026-10-19T03:23:48+03:00"
completed_at: "2026-10-19T03:59:19+03:00"
---

# 085 Eșantioane manuale și contexte la tick

## Obiectiv

Înregistrează input brut, comandă, fizică, bandă, semnal și clasa vehiculului.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 025 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Eșantioanele au SI, tick, controlMode, profileId, learningEpoch și learningEligible fixat la deschidere.
- [x] AUTO și MANUAL nu devin demonstrații; MANUAL rămâne disponibil pentru metrici și istoric.

- [x] Eșantioanele folosesc buffere cu capacitate măsurată; costul colectării nu depinde de serializare JSON la fiecare tick.

## Verificare

Compară segmente cu toggle, schimbare de mașină și pauză.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/telemetry/tick-samples.ts`: recorder de eșantioane la tick cu buffere coloană tipizate (114 B/eșantion), capacitate finită explicită (64…65536, implicit 4096), identități internate per segment, retenție plafonată (8 segmente / 8 MiB), politici explicite de depășire `DROP_OLDEST`/`DROP_NEWEST` cu contoare și un header de segment **înghețat la deschidere** care fixează `controlMode`, `profileId`, `learningEpoch` și `learningEligible` (un `controlMode` sau `baseVersionId` care derivă aruncă). Fiecare eșantion citește metadatele din header-ul segmentului propriu și conține inputul brut, comanda filtrată, mărimile SI autoritative, contextul de bandă/semnal și clasa vehiculului. Criteriul 2 este impus prin construcție: `openSegment` respinge `learningEligible === true` dacă modul nu este `LEARNING`, deci un segment MANUAL/AUTO nu poate deveni demonstrație, dar rămâne citibil pentru metrici și istoric; un toggle de mod sau o schimbare de mașină deschide un segment nou. Exportat prin `src/telemetry/index.ts`.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **859 teste / 859 pass / 0 fail**, de la 848; include cele 11 teste noi din `tests/telemetry/tick-samples.test.ts`) și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei (`node --import ./scripts/register-typescript.mjs scripts/benchmark-telemetry-tick-samples.mjs --baseline`, apoi fără flag, la commit-ul integrat) și a reprodus rezultatul aproape exact: cost adăugat al `record()` p95 **7,6 / 3,9 / 5,4 / 6,0 / 4,0 µs** pe cele cinci perechi (raportat 4,0–8,0 µs), `selfCheck.passed = true`, `bufferBytes 466944 = 4096 × 114` exact, `tickGaps 0`; regiunea JSON separată: `JSON.stringify` p95 6,4 µs față de scrierea în buffer p95 2,6 µs (raport 2,46, raportat 2,4). Build-ul cadrului (1,4–1,8 ms p95) este identic în ambele brațe și **nu** este atribuit recorderului. Acoperire: toggle de mod și schimbare de mașină (segment nou, fără atribuire greșită, capabilități sedan vs compact), pauză (fără eșantioane, `tickGaps 0`, tick-uri regresate/duplicate respinse), capacitate exactă și depășire explicită pentru ambele politici, zero apeluri `JSON.stringify` în 200 de tick-uri, determinism, valori SI finite re-parsate prin contractele 005, memorie plafonată și contoare zero după `dispose`.

Fișiere și documente actualizate: `src/telemetry/tick-samples.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/tick-samples.test.ts` (nou), `scripts/benchmark-telemetry-tick-samples.mjs` (nou), `Docs/telemetry-samples.md` (nou), `Docs/09-telemetrie-si-oportunitati.md`, `Docs/README.md`, `Docs/Evidence/085-telemetry-samples/` (README, ambele brațe JSON și transcripturi, checks, tests).

Limitări sau follow-up: probă CPU/memorie nativă Node doar, fără browser/render/GPU/FPS (recordul 052 documentează stall-ul WebGPU de pe acest laptop), deci gate-ul jocului integrat rămâne nevalidat. `arrayBuffers`/`heapUsed` sunt diagnostice zgomotoase; ownership-ul exact vine din contoarele de typed arrays. Recorderul nu este încă legat în bucla live cu pas fix (integrarea rămâne la 090/222 și la bridge-ul 069). `capabilities` sunt mărimi de admitere derivate din clasa mecanică, nu forțe de pneu măsurate. Contextul de bandă se oprește la `laneId` plus limita consultativă; restul câmpurilor aparțin lui 087. **Constatare de integritate:** codul livrat de 069 nu există în `main` (vezi istoricul), deci recorderul își deține propriul contract `openSegment`/`closeSegment` cu aceleași reguli de header înghețat, iar integrarea cu lifecycle-ul 069 rămâne de făcut după recuperarea acelei livrări.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '085' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-19: Ordonatorul `loop-pbi` a revendicat PBI-ul (owner `opencode deepseek-v4.1-flash medium telemetry-samples-01`); scope-ul de performanță (`simulation`, `memory`) era deja declarat. Mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat recorderul, testele, proba nativă, dovezile și documentația în worktree izolat, cu commit-uri incrementale (`53932f5c`, `53330edf`, `1629b334`, `9eb51355`, `02199ae2`); integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 859/859; catalog sincronizat) și ambele brațe ale sondei (rezultat reprodus în marjă de zgomot); criterii bifate, dovezi completate, mutare fizică In Progress → Done.

- 2026-10-19: **Constatare de integritate raportată, nu ascunsă:** deși 069 este în Done, codul său (`src/telemetry/intervention-*.ts`, `src/app/manual-segment-bridge.ts`) nu există în `main`; PBI-ul 069 declară explicit că livrarea este în worktree-ul `manual-segments-01` (ramura `loop-pbi/manual-segments-01`, 62 de commit-uri în urmă față de `main`), iar commit-urile de documentație ale 069 au fost preluate în `main` fără codul aferent. Recorderul 085 folosește propriul contract de segment și consemnează explicit că integrarea cu lifecycle-ul 069 rămâne de făcut. Decizia de recuperare sau re-deschidere a 069 aparține proprietarului proiectului.
