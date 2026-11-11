---
id: "142"
title: "Rerulare din snapshot cu profil ales"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["140","114"]
owner: "loop-pbi/rerun-142-01"
started_at: "2026-11-11T21:53:23+02:00"
completed_at: "2026-11-11T22:27:55+02:00"
---

# 142 Rerulare din snapshot cu profil ales

## Obiectiv

Rulează scenariul din nou cu profile și seed controlate.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 140 trebuie să existe în Done înainte de începere.
- PBI 114 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cererea și starea inițială sunt identice pentru comparație.
- [x] Divergența oportunităților este raportată fără promisiune bit-exact între orice platformă.

## Verificare

Rerulează două profile pe aceeași platformă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `142-experiment-rerun-v1` în `src/experiments/experiment-rerun.ts`. Rerularea pornește exclusiv din starea restaurată a snapshotului 140 (aceeași încărcare 206, `ticksAdvanced: 0`, 0 diferențe pe 3 080 de câmpuri frunză și 287 de intrări de secțiune), ține seed-ul constant prin lanțul `deriveScenarioSeed` → `deriveVehicleSeed` → `deriveOpportunitySeed` (identitatea profilului nu intră în seed) și re-decide 24 de oportunități prin politicile reale 050/051, proiectate din `DrivingProfile`-ul real. Cu `PRUDENT` (`prudent-142@1`) și `IMPULSIVE` (`impulsive-142@1`) pe același snapshot și același seed de bază 142 000 (seed de scenariu `51107408`), rezultatul este: 16 oportunități identice, 8 divergente — 7 `PROBABILITY_THRESHOLD` (`stop_full_probability` 4, `red_stop_probability` 3) și 1 `GEOMETRY_PARAMETER` (`stop_dwell_time`), cu 0 `SEED_DIVERGENCE` și 0 divergențe neatribuite. Divergența este raportată per oportunitate cu tick, acțiune, motiv, eșantionul comun și parametrul care o explică; `EXPERIMENT_RERUN_REPRODUCIBILITY` declară `SAME_PLATFORM_SAME_SEED` și `crossPlatformBitExactness: false`. Ledger-ele 093/125/137 rămân izolate: amprentă identică înainte/după, `liveWrites: 0`.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS; `npm run check:architecture` PASS (346 fișiere TypeScript); `npm run check:parameter-catalog` PASS; `npm test` 2 511 teste, 2 511 trecute, 0 eșuate; `node --import ./scripts/register-typescript.mjs --test "tests/experiments/experiment-rerun.test.ts"` 10 teste, 10 trecute; `npm run experiment:rerun` 25/25 verificări, 5 probe de refuz, 24 oportunități, 8 divergențe, PASS; `npm run experiment:rerun -- --check` „Experiment rerun report is current” (exit 0).

Fișiere și documente actualizate: `src/experiments/experiment-rerun.ts` (nou), `src/experiments/index.ts` (un export adăugat la finalul listei), `tests/experiments/experiment-rerun-fixture.ts` (nou), `tests/experiments/experiment-rerun.test.ts` (nou, 10 teste), `tests/experiments/experiment-rerun-report.ts` (nou), `scripts/run-experiment-rerun-report.mjs` (nou, cu `--check`), `package.json` (intrarea `experiment:rerun`, ultima din blocul `"scripts"`), `Docs/14-experimente-si-indicatori.md` (secțiune nouă la finalul fișierului), `Docs/Evidence/142-experiment-rerun/` (README, `report.json`, `report.md`).

Limitări sau follow-up: validare funcțional izolată (fixture determinist, fără browser/GPU/măsurători de cost); rerularea re-decide oportunitățile din starea restaurată fără a avansa fizica sau pipeline-ul Babylon, iar geometria de apropiere este intrare de scenariu identică pentru ambele profile (identitatea oportunității, vehiculul și semaforul sunt validate față de snapshot); compoziția injectează funcțiile 206 și ledger-ele reale, `src/experiments` nu importă `src/persistence`; digestul de trasare este `FNV-1a` pe 32 de biți, detector de egalitate determinist, nu hash criptografic; nu există legare în `src/app` (în afara ownership-ului).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '142' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11 21:53: preluat de `loop-pbi/rerun-142-01`, mutat în In Progress.
- 2026-11-11 22:28: implementat contractul `142-experiment-rerun-v1` (rerulare din snapshotul 140, seed explicit independent de profil, două profile reale 105, atribuirea divergenței oportunităților, izolarea ledger-elor), 10 teste deterministe, raport determinist 25/25; mutat în Done după verificări.
