---
id: "038"
title: "Priorități și evaluarea spațiilor"
status: "Done"
release: "V1"
module: "Oraș"
performance_checks: ["simulation", "memory"]
depends_on: ["035","037"]
owner: "Codex PBI038"
started_at: "2026-10-05T04:20:16.2476952+03:00"
completed_at: "2026-10-05T04:52:06.1245755+03:00"
---

# 038 Priorități și evaluarea spațiilor

## Obiectiv

Definește prioritatea de hartă și oportunități de traversare.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 035 trebuie să existe în Done înainte de începere.
- PBI 037 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Timpul până la conflict este calculat în unități coerente.
- [x] Lipsa traficului nu este înregistrată ca refuz de prioritate.

## Verificare

Testează conflict eligibil, conflict absent și cedare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Sidecar versionat exhaustiv de prioritate validat contra035, TTC SI și gapuri pe trafic autoritar observabil, UNKNOWN fail closed, context fără reward/refuz automat, yield singular și traversare swept continuă.

Verificări executate și rezultat:17teste038 PASS; npm run check PASS279 (typecheck/lint/format/architecture); npm run build PASS; benchmark before/final real cu10000lookups comparabili, cost nou observeroff/on și20lifecycle cycles. [Raport](../../Docs/Evidence/038-priority-rules/report.md); Validate-Board -RequireDone038 după mutarea fizică, output în board.txt.

Fișiere și documente actualizate: src/world/priority-policy.ts, priority-arrival.ts, priority-rules.ts; public world exports (parent); tests/world/priority-rules-fixture.ts și priority-rules.test.ts; scripts/benchmark-priority-rules.mjs; Docs/priority-rules.md și Evidence/038-priority-rules; Docs04/README links (parent).

Limitări sau follow-up: Datele de distanță/clearance sunt furnizate autoritar de caller; nu există trafic fizic live încă. EQUAL nu inventează obligație. Predicție constant-velocity și praguri provizorii ce cer calibrare. Proba CPU nu certifică FPS/GPU ori tickul complet; limits/memory envelope documentate explicit.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '038' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T04:52:06.1265233+03:00: criterii verificate, check279/build/probe reale PASS; mutare fizică Done și RequireDone038 obligatoriu.
