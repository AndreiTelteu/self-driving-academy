---
id: "008"
title: "Buclă de simulare cu pas fix"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["005","007"]
performance_checks: ["simulation", "frame"]
owner: "Codex gpt-6.1-sol / pbi007_event_bus (PBI008)"
started_at: "2026-10-05T02:22:32.6216198+03:00"
completed_at: "2026-10-05T02:32:41.4905230+03:00"
---

# 008 Buclă de simulare cu pas fix

## Obiectiv

Creează accumulator, tick-uri la 60 Hz și snapshoturi interpolate.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Framerate-uri diferite nu schimbă timpul simulat al aceleiași secvențe de comenzi.
- [x] Pauzele lungi nu produc un pas de fizică uriaș.

- [x] Recuperarea plafonată și timpul simulat sunt observabile; background-ul și suprasarcina nu produc tick-uri sau câștiguri fictive.

## Verificare

Compară rulări cu render la 30 și 60 FPS și o pauză.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Core pur fixed60Hz cu accumulator, max4 pași/frame, debt păstrat, pause/background, overload/recovery explicit, snapshots defensive și port generic de interpolare. Fault terminal fără retry/rollback extern. Nu implementează fizică/gameplay.

Verificări executate și rezultat: 13/13 teste PASS; 30vs60 cadențe sintetice pe 10 minute =36000 ticks/comenzi identice; strict typecheck scoped, lint/format, arhitectură și build PASS. Baseline înainte/după și cost loop/observator separat în Docs/Evidence/008-fixed-tick/dovezi.txt. Primul check global 153 PASS/1 fail din test032 încă în lucru; verificarea globală finală aparține părintelui.

Fișiere și documente actualizate: src/simulation/fixed-tick.ts, export src/simulation/index.ts, tests/fixed-tick/fixed-tick.test.ts, scripts/benchmark-fixed-tick.mjs, Docs/fixed-tick.md și Docs/Evidence/008-fixed-tick/*.txt. Linkuri Docs02/README integrate de părinte.

Limitări sau follow-up: Core pur fără RAF/visibility adapter; composition root conectează explicit background/pause. Porturi sincrone și snapshots plain-data; costul proiecțiilor mari se măsoară la integrare. Fault necesită recuperarea lumii, fără rollback/retry automat. CPU fixture nu închide FPS hardware/whole-tick/frame gates.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '008' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.


- 2026-10-05T02:32:41.4931636+03:00: Implementare008 și verificări relevante încheiate; probe CPU/determinism și limite exacte documentate. Mutarea fizică și validatorul final sunt executate la finalizarea acestei tranziții.


- 2026-10-05T02:45:21.1868648+03:00: Validare integrată de părinte pentru lotul 008/013/032: npm run check PASS (158 teste), npm run build PASS; Validate-Board -RequireDone 008,013,032 și Validate-Plan PASS. Loguri: Docs/Evidence/013-scene-adapter/integration-check.txt și integration-build.txt. Avertismentul Vite pentru bundle >500 kB rămâne documentat.
