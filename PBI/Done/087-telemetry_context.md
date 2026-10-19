---
id: "087"
title: "Ferestre eligibile și constrângeri externe"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["086","048"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium eligibility-windows-01"
started_at: "2026-10-19T12:52:57+03:00"
completed_at: "2026-10-19T13:19:01+03:00"
---

# 087 Ferestre eligibile și constrângeri externe

## Obiectiv

Etichetează trafic liber, lider, verde blocat, limită mecanică și impact.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 086 trebuie să existe în Done înainte de începere.
- PBI 048 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Verdele blocat, limita mecanică și impactul nu sunt interpretate ca preferințe personale.
- [x] Timpii de reacție cer un stimul observabil din camera jucătorului sau fixture controlat.

## Verificare

Testează context eligibil, stimul ascuns, coadă, impact și limitare mecanică.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/telemetry/eligibility-windows.ts`, exportat prin `src/telemetry/index.ts`: fiecare oportunitate 086 primește o etichetă dintr-un vocabular închis, mapată total pe trei clase — `ELIGIBLE` (trafic liber), `EXTERNAL_CONSTRAINT` (lider/coadă, verde blocat din contextul real 038/044, limită mecanică față de capabilitatea reală a clasei 023, impact/daune/recuperare) și `EXCLUDED` (`PAUSE`, `FOCUS_LOST`, `MANUAL_SEGMENT`, `AUTO_SEGMENT`, `NOT_OBSERVABLE`). Criteriul 1 este structural: o fereastră de constrângere externă nu poate emite un record de preferință — numitorii expun `preferenceEvidenceEmitted` separat, iar poarta refuză explicit (`preferenceEvidenceRefused`); testele acoperă verde blocat, impact și limită mecanică. Criteriul 2 este tot structural: o fereastră de reacție se deschide numai când stimulul este observabil — fie din adevărul real de cameră/randare, fie dintr-un fixture controlat care îl declară — altfel fereastra este `NOT_OBSERVABLE` și nu contribuie la numitorul de reacție. Vocabularul `PAUSE`/`FOCUS_LOST` rezervat de 070 este implementat aici, în stratul de eligibilitate, nu în recorder-ul 085; segmentele MANUAL/AUTO rămân neeligibile pentru învățare, ca la 069/085. Magazia este mărginită (4096 implicit, 128 B/înregistrare, plafon derivat ≈8,5 MiB), refuză intrarea malformată, retrage cel mai vechi și își păstrează numitorii cumulativi după `dispose()`.

Verificări executate și rezultat: subagentul a livrat munca și commit-urile, dar raportul final i-a fost întrerupt; orchestratorul a preluat verificarea pe starea integrată în `main`: `npm run check` EXIT 0 (`npm test` **992 teste / 992 pass / 0 fail**, de la 981; include cele 11 teste noi din `tests/telemetry/eligibility-windows.test.ts`) și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei în worktree temporar la commit-ul integrat: `selfCheck.passed = true` cu `preferenceEvidenceEmitted 0` pe toate ferestrele măsurate (criteriul 1 respectat și sub sarcină), toate cele 18 ferestre ale fixture-ului clasificate `EXTERNAL_CONSTRAINT`/`LEADER` (deci zero ferestre de reacție deschise pe un context de coadă — poarta de observabilitate nu se deschide artificial), memorie `retained 4096 = capacitate`, `retiredTotal 1024`, `estimatedBytesMaximum 8.912.896 B (≈8,5 MiB)`, `withinCeiling true`, `disposedCountersZero true`, iar costul adăugat `eligibilityOverRegistry p95 0,0211 ms` și `eligibilityOverWorld p95 0,0398 ms` per lot de etichete. Testele acoperă exact linia de verificare a PBI-ului: context eligibil, stimul ascuns de fixture sau în afara conului camerei, coadă/lider, verde blocat din contextul real 038/044, impact, limitare mecanică față de clasa reală 023, suspendare și segment ne-LEARNING cu motive proprii, poarta de reacție cu restrângere monotonă, vocabularul total de etichete, magazia mărginită și lanțul real 036/037/086 la cadența 219.

Fișiere și documente actualizate: `src/telemetry/eligibility-windows.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/eligibility-windows.test.ts` (nou), `scripts/benchmark-eligibility-windows.mjs` (nou), `Docs/eligibility-windows.md` (nou), `Docs/09-telemetrie-si-oportunitati.md`, `Docs/README.md`, `Docs/Evidence/087-eligibility-windows/` (README, checks, tests, ambele brațe native).

Limitări sau follow-up: probă nativă CPU/memorie deținută doar; fără browser/renderer/GPU/FPS, iar `frame` nu este declarat, deci gate-ul jocului integrat rămâne nevalidat. Contoarele de heap sunt diagnostice; ownership-ul exact vine din contoarele de eligibilitate. Brațul BEFORE este același fixture cu registrul și eligibilitatea dezactivate, nu o revizie istorică (087 este pur aditiv). Stratul nu estimează parametri, nu publica profile și nu antrenează nimic — acelea aparțin lui 088/095; nu este nici lifecycle-ul de segment 069, nici arbitrul de suspendare 070, nici recorder-ul 085.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '087' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia Telemetrie (085/086). Owner `opencode deepseek-v4.1-flash medium eligibility-windows-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat stratul de eligibilitate, testele, proba nativă și documentația (`2bc1f927`, `895599f8`, `b14de561`, `b6b38aa2`, `7d7a2774`), dar raportul final i-a fost întrerupt; integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a preluat verificarea (fără a recrea munca): `npm run check` EXIT 0 (992/992), catalog sincronizat, ambele brațe ale sondei re-rulate independent (`preferenceEvidenceEmitted 0`, memorie mărginită, cost adăugat reprodus), acoperirea celor două criterii confirmată din lista de teste; criterii bifate, dovezi completate, mutare fizică In Progress → Done.
