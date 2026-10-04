---
id: "085"
title: "Eșantioane manuale și contexte la tick"
status: "To Do"
release: "V1"
module: "Telemetrie"
depends_on: ["069","044","025"]
performance_checks: ["simulation", "memory"]
owner: null
started_at: null
completed_at: null
---

# 085 Eșantioane manuale și contexte la tick

## Obiectiv

Înregistrează input brut, comandă, fizică, bandă, semnal și clasa vehiculului.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 025 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Eșantioanele au SI, tick, controlMode, profileId, learningEpoch și learningEligible fixat la deschidere.
- [ ] AUTO și MANUAL nu devin demonstrații; MANUAL rămâne disponibil pentru metrici și istoric.

- [ ] Eșantioanele folosesc buffere cu capacitate măsurată; costul colectării nu depinde de serializare JSON la fiecare tick.

## Verificare

Compară segmente cu toggle, schimbare de mașină și pauză.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '085' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.
