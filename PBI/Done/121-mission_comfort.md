---
id: "121"
title: "Cursa cu obiectiv de confort"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["116","085"]
owner: "loop-pbi/mission-chain-117-121-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T09:36:12+03:00"
completed_at: "2026-10-22T15:24:31+03:00"
---

# 121 Cursa cu obiectiv de confort

## Obiectiv

Definește praguri de confort din accelerație și jerk cu pasager.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 116 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Obiectivul este explicit și separat de fidelitatea stilului.
- [x] Indicatorii nu includ impulsuri de teleportare.

## Verificare

Testează condus lin, brusc și recuperare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: obiectivul de confort este livrat ca contract de domeniu în `src/missions/comfort.ts` (schema `121-mission-comfort-v1`), cu obiectivul explicit `passenger-comfort`. Pragurile sunt **date reale din proiect**, nu valori inventate pentru misiune: 2 m/s² accelerație (`comfort_deceleration`) și 2 m/s³ jerk (`acceleration_jerk`), citite la import din registrul real de parametri (`parameterRegistry`), publicate prin `COMFORT_THRESHOLD_SOURCE` și protejate de parser; un profil publicat sau ajustat manual nu este citit, pipeline-ul 112 nu este atins și confortul nu este o cheie de profil. Separarea de stil este declarată în contract (`separation.styleFidelity = NOT_USED`, `separation.styleScore = NOT_USED`), rezultatul are `styleFidelity: null` și `styleScoreUsed: false`, iar un câmp de scor de stil în intrare este refuzat ca câmp necunoscut. Toate intrările sunt contracte reale: pasagerul derivat din ciclul 061 (`TO_DROPOFF`/`DROPOFF`), segmente 069 cu `controlMode`/`learningEligible` fixate, eșantioane din recorderul real 085 prin `comfortTelemetryFromTickSamples` și ferestre de excludere din filtrul real 088. Indicatorii nu includ impulsuri de teleportare: se folosește exclusiv span-ul `suppressed` al ferestrelor 088, orice eșantion din span este eliminat, iar orice interval de accelerație care traversează span-ul este eliminat; recuperările 030 rămân vizibile doar ca dovezi excluse (`exclusions.teleports/collisions/pauses`). Misiunea `campaign-5-comfort-ride` este un catalog 116 separat, iar poarta de confort este explicită: `comfortMissionOutcome` completează numai pentru rezultat `PASSED`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!” exit 0; `npm run check:architecture` PASS (267 TypeScript files), exit 0; `npm run check:parameter-catalog` „Parameter catalog is synchronized.” exit 0; `npm test` — tests 1923, pass 1923, fail 0, duration_ms 67029.8014; testele țintă `tests/missions/mission-comfort.test.ts` — tests 19, pass 19, fail 0, duration_ms 774.458; `scripts/run-mission-comfort-report.mjs` — „SUMMARY checks 43/43, scenarios 10, teleports excluded 1, overall PASS”, iar varianta `--check` confirmă „Mission comfort report is current”. Scenarii reale (raport determinist): lin `PASSED` (vârf 0,9375 m/s², jerk 0, 120/119 intervale), brusc `FAILED ACCELERATION_LIMIT` (vârf 5,625 m/s², 120 depășiri), jerk `FAILED JERK_LIMIT` (accelerație 1,875 m/s² sub prag, jerk 225 m/s³, 119 depășiri), recuperare cu segment închis de 030 `PASSED` (1 eșantion și 1 interval excluse, 1 teleport numărat) și recuperare cu segment deschis `PASSED` (61 eșantioane excluse), iar aceeași cursă fără fereastra 088 `FAILED BOTH_LIMITS` cu vârf 720,9375 m/s² — deci filtrarea, nu pragul, separă teleportarea de condus. Verificarea `telemetry-derived-matches-recorded` arată deviație 0 m/s² între accelerația derivată de metrică și accelerația longitudinală înregistrată de 085.

Fișiere și documente actualizate: `src/missions/comfort.ts` (nou), `src/missions/index.ts` (exporturi publice), `tests/missions/comfort-fixture.ts` (nou), `tests/missions/mission-comfort.test.ts` (nou), `tests/missions/mission-comfort-report.ts` (nou), `scripts/run-mission-comfort-report.mjs` (nou), `Docs/13-misiuni-si-progres.md` (secțiunea contractului 121), `Docs/Evidence/121-mission-comfort/README.md`, `checks.txt`, `tests.txt`, `report.json`, `report.md` și mutarea taskului în `PBI/Done/121-mission_comfort.md`. Nu au fost atinse pipeline-ul 112, catalogul de parametri și modulele 061/069/085/088.

Limitări sau follow-up: pragurile sunt valorile implicite livrate de catalog, nu o calibrare cu pasageri umani (calibrarea rămâne deschisă; PBI 139 acoperă metricile KPI de confort, nu acest obiectiv); cursele din fixture sunt înregistrări deterministe ale recorderului 085, nu condus uman, cu pași de accelerație dyadici pentru ca stocarea float32 să fie exactă; recorderul 085 refuză fizica din afara ±100 m/s², deci tick-ul teleportat este înregistrat cu accelerație zero (recuperarea stabilește viteza) și saltul e identificat de filtrul 088; obiectivul nu are UI în V1 și nu este montat în `main.ts` sau în vertical slice (PBI 118/126), deci nu există probă de browser și nu se măsoară performanță, memorie sau latență; obiectivul acoperă accelerația longitudinală și jerk-ul, nu accelerația laterală sau confortul în viraje.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '121' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22: implementare începută în In Progress (owner `loop-pbi/mission-chain-117-121-01`).
- 2026-10-22: obiectivul de confort livrat cu praguri din catalogul real de parametri, pasager derivat din 061, segmente 069, telemetrie 085 și excluderi 088; 19 teste țintă PASS, suite completă 1923/1923 PASS, raport determinist 43/43 PASS; fișier mutat fizic în Done.
