---
id: "010"
title: "Protocol pentru workers și anulare"
status: "To Do"
release: "V1"
module: "Fundație"
depends_on: ["005","006"]
performance_checks: ["workers", "memory"]
owner: null
started_at: null
completed_at: null
---

# 010 Protocol pentru workers și anulare

## Obiectiv

Definește jobId, segmentId, baseVersionId, progres, rezultat și anulare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Rezultatele întârziate se pot identifica și nu scriu direct starea lumii.
- [ ] Un job anulat nu blochează workerul pentru jobul următor.

- [ ] Protocolul expune bytes/ownership și prioritate; anularea/progresul nu generează trafic de mesaje neplafonat.

## Verificare

Simulează mesaje în ordine greșită, anulare și eroare de worker.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '010' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.
