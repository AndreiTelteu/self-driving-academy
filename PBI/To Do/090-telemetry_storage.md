---
id: "090"
title: "Compactare buffer și finalizare segment"
status: "To Do"
release: "V1"
module: "Telemetrie"
depends_on: ["089","010"]
performance_checks: ["memory", "workers", "frame"]
owner: null
started_at: null
completed_at: null
---

# 090 Compactare buffer și finalizare segment

## Obiectiv

Compactează la frecvența de analiză și păstrează timpii evenimentelor.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 089 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Bufferul are limite și finalizează segmentul fără a bloca frame-ul.
- [ ] Evenimentele de oprire și reacție nu pierd rezoluția tick-ului.

- [ ] Chunkurile/rollover-ul păstrează continuitatea și oportunitățile; se măsoară bytes și transferul fără detașarea datelor live.

## Verificare

Testează intervenție lungă, buffer plin și segment foarte scurt.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '090' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
