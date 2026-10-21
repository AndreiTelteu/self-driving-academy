---
id: "208"
title: "Propagarea stilului către taxiuri și civili"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["110","111","058","106"]
owner: "opencode deepseek-v4.1-flash city-style-01"
started_at: "2026-10-21T21:21:38.611Z"
completed_at: "2026-10-22T00:53:58+03:00"
---

# 208 Propagarea stilului către taxiuri și civili

## Obiectiv

Verifică în sesiunea live profilul comun și imitația civililor, inclusiv după learning într-o mașină civilă.

## Context și plan

- [06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md)
- [12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 111 trebuie să existe în Done înainte de începere.
- PBI 058 trebuie să existe în Done înainte de începere.
- PBI 106 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toate vehiculele adoptă aceeași versiune la tick-ul comun, inclusiv cele create ulterior.
- [x] Civilii păstrează rutele și limitele mecanice; nu există profil fix ascuns care anulează stilul comun.
- [x] MANUAL civil nu schimbă profilul; LEARNING civil eligibil influențează ambele categorii.

## Verificare

Rulează activare în trafic mixt, vehicule nevizibile, spawn ulterior și eliberarea unui civil.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: Harness-ul `208-city-style-v1` rulează șapte faze pe o flotă mixtă reală 057 (taxiuri + civili) cu activarea 110, traficul civil 058, pipeline-ul 112 și țintele de stil 106. Înainte de tick-ul comun comanda este `PENDING` și nu se scrie nimic; după tick toate cele 40 de vehicule — taxiuri și civili, inclusiv ascunse, selectate, conduse de jucător sau în MANUAL/LEARNING — raportează aceeași versiune la același tick, iar raportul și lista flotei rămân identice. Se scrie exact `{tick, appliedProfileVersion}`, iar un pas civil la 60 Hz păstrează versiunea. Vehiculele create înainte de tick citesc ținta pending, cele create după tick citesc versiunea activă; nu există o a doua comandă sau versiune per categorie. Toate cele 20 de amprente de rută civilă și limitele mecanice/clasele rămân neschimbate. Un segment civil MANUAL este `SKIPPED_MANUAL`/`MANUAL_SEGMENT_NOT_LEARNABLE`, fără job 103, versiune 109 sau comandă 110 (`manualVersionChanges: 0`); după eliberarea în AUTO, civilul păstrează ruta și versiunea comună și conduce din nou. Un segment civil LEARNING eligibil produce exact o versiune nouă, iar histogramele TAXI și CIVILIAN au aceeași singură cheie (`crossCategoryUpdated: true`), cu modul și ruta păstrate. `hiddenOverrides` este gol în fiecare fază, fără override per clasă și cu lista de vehicule imuabilă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (252 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1772/1772 pass, 0 fail; `npm run city:style` 71/71 verificări, 7 faze, overall PASS; `npm run city:style -- --check` „City style report is current”. Testele țintite 208: 17/17 pass. Raportul acoperă activarea mixtă, vehiculele ascunse, spawn-ul ulterior, MANUAL civil, eliberarea civilului, LEARNING civil și păstrarea rutelor/limitelor. Dovezi: [report.json](../../Docs/Evidence/208-city-style/report.json), [report.md](../../Docs/Evidence/208-city-style/report.md), [README](../../Docs/Evidence/208-city-style/README.md).

Fișiere și documente actualizate: `src/app/city-style-propagation.ts`, `src/app/index.ts`, `tests/app/city-style-propagation.test.ts`, `tests/app/city-style-propagation-report.ts`, `scripts/run-city-style-propagation-report.mjs`, `package.json`, `Docs/city-style.md`, `Docs/06-autonomie-si-trafic.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/README.md` și `Docs/Evidence/208-city-style/`.

Limitări sau follow-up: Harness offline determinist; nu există corp Rapier, renderer, cameră, captură browser, FPS/GPU sau măsurători hardware. Coada/transportul 103 este injectat de apelant; doar pipeline-ul/store-ul/activarea/flota/lanțul civil sunt exercitate real. Proiecția 109→`DrivingProfile` marchează valorile `BASE` pentru că 092 raportează încă `estimable: false` pentru fiecare cheie; 208 nu modifică registrul. `refreshStyle()` este apelat numai după `APPLIED` și înainte de următorul pas civil (058 își păstrează bundle-ul compilat), ordine documentată ca regulă de integrare.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '208'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-22: Implementare finalizată: activare mixtă taxi+civil la tick comun, spawn ulterior, rute/limite civile păstrate, MANUAL civil fără profil și LEARNING civil eligibil care actualizează ambele categorii, fără override ascuns; 17 teste, raport cu 71 de verificări și documentație. Mutat fizic în Done după validare.
