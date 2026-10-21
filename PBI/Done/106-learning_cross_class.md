---
id: "106"
title: "Fidelitate între clase și condus liber"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["105","089"]
owner: "opencode deepseek-v4.1-flash cross-class-fidelity-01"
started_at: "2026-10-21T14:42:25.420Z"
completed_at: "2026-10-21T18:06:27+03:00"
---

# 106 Fidelitate între clase și condus liber

## Obiectiv

Verifică învățarea LEARNING din taxiuri și civile, normalizarea între clase și efectul profilului comun asupra ambelor categorii.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 105 trebuie să existe în Done înainte de începere.
- PBI 089 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Transferul păstrează tendințele fără a copia capacitățile mecanice.
- [x] Același traseu în MANUAL nu schimbă profilul; LEARNING eligibil îl poate schimba.
- [x] Comportamentele nereprezentabile sunt raportate ca atare.

## Verificare

Compară stiluri în ambele clase și o manevră în afara scope-ului.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Harness-ul `106-cross-class-fidelity-v1` compară două clase cu capacități mecanice diferite (sedan și compact) și două stiluri cunoscute (cautious și assertive), folosind normalizatorul real 089 și estimatorii reali 094/095. Cererea fizică brută este generată față de plafonul clasei, apoi convertită în rapoarte normalizate; estimările sunt comparate numai după normalizare. Tendința este păstrată în ambele clase (cautious < assertive pentru viteză/accelerație, invers pentru reacție), iar estimările normalizate se încadrează în toleranțele explicite per cheie. Valorile mecanice brute diferă între clase și nu sunt niciodată copiate în profilul comun; o valoare egală cu plafonul clasei sau cu p50-ul brut al celeilalte clase este raportată ca `MECHANICAL_CAPABILITY_COPIED` și eșuează, inclusiv proba injectată cu plafonul sedanului. Profilul comun este identic pentru TAXI și CIVILIAN, fără suprascrieri per clasă. Pe același traseu și aceleași observații, MANUAL produce `MANUAL_NO_LEARNING` (poarta 103 `MANUAL_SEGMENT_NOT_LEARNABLE`) fără candidat sau versiune; LEARNING ineligibil produce `INELIGIBLE` fără schimbare; LEARNING eligibil produce un candidat real 095 + 101 cu dovezi `READY`, marcat `published:false` și `learned:false`. Manevra în afara scope-ului (`EVASIVE_SWERVE_AROUND_HAZARD`) este `UNREPRESENTABLE`, cu `estimate:null`, `key:null` și `value:null`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (236 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1588/1588 pass, 0 fail; `npm run learning:cross-class` 47/47 verificări, 7 scenarii, overall PASS; `npm run learning:cross-class -- --check` „Cross-class fidelity report is current”. Testele țintite 106: 18/18 pass. Raportul confirmă `trendPreserved`, `normalizedAgreement`, `mechanicalCopied=false`, `commonProfileSameAcrossKinds`, `commonProfileNoClassOverrides`, `manualNoLearning`, `learningEligibleChanged`, `learningIneligibleUnchanged`, `sameRoute`, `unrepresentableReported`, `storeWrites=0`, `fleetMutations=0`, `profilePublications=0`. Dovezi: [report.json](../../Docs/Evidence/106-cross-class-fidelity/report.json), [report.md](../../Docs/Evidence/106-cross-class-fidelity/report.md), [README](../../Docs/Evidence/106-cross-class-fidelity/README.md).

Fișiere și documente actualizate: `src/experiments/cross-class-fidelity.ts`, `src/app/cross-class-fidelity.ts`, `src/experiments/index.ts`, `src/app/index.ts`, `tests/experiments/cross-class-fidelity.test.ts`, `tests/experiments/cross-class-fidelity-report.ts`, `scripts/run-cross-class-fidelity-report.mjs`, `package.json`, `Docs/cross-class-fidelity.md`, `Docs/10-invatarea-stilului.md`, `Docs/README.md` și `Docs/Evidence/106-cross-class-fidelity/`.

Limitări sau follow-up: Observațiile sunt sintetice și deterministe, nu capturi de gameplay sau sesiuni de browser. Harness-ul construiește înregistrări 086/087/088 și rulează normalizatorul real 089 plus estimatorii 094/095, dar nu exercită worker-ul 103, profile store, publicarea 110 sau o flotă reală. `curve_lateral_accel` păstrează diferența reală de reconstrucție a plafonului de clasă din 094, deci folosește toleranța mai largă documentată în 106, nu toleranța inversă din 105. Toleranțele sunt limite de calibrare, nu intervale de încredere statistice. Nu se pretinde captură browser, FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '106' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: normalizare reală 089, tendințe păstrate fără copierea capacităților mecanice, profil comun identic TAXI/CIVILIAN, MANUAL fără învățare vs LEARNING eligibil, manevră nereprezentabilă raportată; 18 teste, raport cu 47 de verificări și documentație. Mutat fizic în Done după validare.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
