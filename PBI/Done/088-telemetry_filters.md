---
id: "088"
title: "Filtrarea artefactelor și segmente parțiale"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["087","030"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium telemetry-filters-01"
started_at: "2026-10-19T13:30:18+03:00"
completed_at: "2026-10-19T14:04:17+03:00"
---

# 088 Filtrarea artefactelor și segmente parțiale

## Obiectiv

Separă coliziuni, teleportări, pauze și eșantioane incomplete.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 087 trebuie să existe în Done înainte de începere.
- PBI 030 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Datele înaintea impactului pot rămâne utile; impulsul impactului nu devine preferință.
- [x] Segmentul recuperat păstrează cauza și gradul de completitudine.

## Verificare

Testează impact, reset și crash cu ultimul checkpoint.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/telemetry/artifact-filter.ts` (`createArtifactFilter`), exportat prin `src/telemetry/index.ts`: vocabular închis de artefacte (COLLISION/COLLISION_IMPULSE din 028, TELEPORT/RECOVERY_TELEPORT|DENIED|PARTIAL din 030, PAUSE/SUSPENSION_PAUSE|FOCUS_LOST din 070+012, INCOMPLETE_SAMPLE/SEGMENT_INCOMPLETE|CLOSE_REASON_DATA_LOSS din 069+085, CHECKPOINT_LOST din 222, OBSERVATION_GAP din 085), fiecare cu sursa autoritară a faptului. **Criteriul 1 este impus prin construcție:** `splitWindowAtArtifacts` fixează granița la primul artefact, păstrează prefixul `[startTick, boundaryTick-1]` cu propriul numitor de tick-uri și suprimă impulsul plus tot ce urmează; uniunea discriminată `PrefixEligibleWindowRecord`/`FullySuppressedWindowRecord` face ca `emitPreImpactEvidence` să accepte **numai** o fereastră cu prefix utilizabil, reverificând ownership-ul și ne-golirea prefixului la runtime. **Criteriul 2:** fiecare fereastră expune `completeness` din `{COMPLETE, PARTIAL, TRUNCATED}` cu motiv închis și monoton, iar o plasare 030 păstrează integral cauza și dovada (`operationId`, `recoveryPointId`, `recoveryLaneId`, `recoveryValidatedTick`). Crash-ul cu checkpoint pierdut produce `TRUNCATED`/`CHECKPOINT_LOST`, niciodată `COMPLETE`. Magazia este mărginită (32…7168, implicit 4096; 192 B/înregistrare; plafon derivat 4288 B; maximum 64 de artefacte per fereastră), cu contoare cumulative care supraviețuiesc pensionării și `dispose()`. Stratul consumă faptele 028/030/069/070/085/086/087 și nu le dublează.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **1000 teste / 1000 pass / 0 fail**, de la 992; include cele 8 teste noi din `tests/telemetry/artifact-filter.test.ts`), `npm run check:parameter-catalog` EXIT 0 și `npm run build` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei în worktree temporar la commit-ul integrat: `selfCheck.passed = true` cu artefactele reale injectate (COLLISION 1, TELEPORT 1), **`prefixEligible 1` cu 299 tick-uri utilizabile și 501 suprimate** (tăierea exactă la impact, criteriul 1), `preferenceEvidenceEmitted 0`, `partial 1` (criteriul 2), memorie `retained 4096 = capacitate`, `truncated 1024` la pierderea de checkpoint, `estimatedBytesMaximum 17.563.648 B (≈16,75 MiB)`, `withinCeiling true`, `disposedCountersZero true`. Testele acoperă linia de verificare: impact cu tăiere exactă la `boundaryTick` (40 tick-uri prefix / 60 suprimate, refuz runtime pentru o fereastră complet suprimată), reset/recuperare cu cauza 030 păstrată și `PARTIAL`/`RECOVERY`, crash cu `lostCheckpointTick` → `TRUNCATED`/`CHECKPOINT_LOST`, pauză/suspendare cu motiv propriu care nu devine eșec de reacție, segment curat rămâne `COMPLETE`, plus determinism, magazie mărginită, respingere de input malformat, eliberare la `dispose()` și un test de lanț real la cadența 219.

Fișiere și documente actualizate: `src/telemetry/artifact-filter.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/artifact-filter.test.ts` (nou), `scripts/benchmark-telemetry-artifacts.mjs` (nou), `Docs/telemetry-filters.md` (nou), `Docs/09-telemetrie-si-oportunitati.md`, `Docs/README.md`, `Docs/Evidence/088-telemetry-filters/` (README, checks, tests, ambele brațe native).

Limitări sau follow-up: probă nativă CPU/memorie deținută doar; fără browser/renderer/GPU/FPS, `frame` nedeclarat, deci gate-ul jocului integrat rămâne nevalidat. Fixture-ul 044 nu are coliziune/recuperare, deci identitatea reală 028 și forma reală `RecoveryRecord` a 030 sunt injectate la câte un tick (etichetat), în timp ce `createRecoveryLedger` al 030 este exersat real în suite. Filtrul nu este încă legat în bucla live cu pas fix. Proprietarul 222 al checkpointului durabil nu există încă, deci faptul pierderii este raportat de apelant, iar contractul de reload este documentat dar nelegat într-o cale live. `estimatedBytes` este contor derivat de proprietate, nu heap sau RAM totală exactă.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '088' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia Telemetrie (085–087). Owner `opencode deepseek-v4.1-flash medium telemetry-filters-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat filtrul, testele, proba nativă și documentația, cu commit-uri incrementale (`ead37628`, `12e30fd1`, `c1d16a8d`, `167f49d5`, `e3df6606`, `4ca997ab`, `3bff7415`), cu sursele măsurate înghețate la `e3df6606`; integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 1000/1000; `npm run build` EXIT 0; catalog sincronizat) și ambele brațe ale sondei 088 (prefix eligibil 299 tick-uri, 501 suprimate, zero dovezi de preferință, completitudine `PARTIAL`); criterii bifate, dovezi completate, mutare fizică In Progress → Done.
