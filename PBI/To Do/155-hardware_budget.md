---
id: "155"
title: "Verificarea finală a hardware-ului și bugetelor stabilite"
status: "To Do"
release: "V1"
module: "Validare și release"
depends_on: ["154","019","203","220","222","223"]
performance_checks: ["frame", "simulation", "memory", "loading"]
owner: null
started_at: null
completed_at: null
---

# 155 Verificarea finală a hardware-ului și bugetelor stabilite

## Obiectiv

Verifică pe jocul complet configurațiile și bugetele fixate în 203, fără redefinirea lor retroactivă.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 154 trebuie să existe în Done înainte de începere.
- PBI 019 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] FPS/frame time/memorie/încărcare sunt măsurate pe configurațiile fixate.
- [ ] Se raportează abaterile și costurile learning, recorderului, KPI-urilor, creditelor XP, provocărilor și distrugerii.

- [ ] Configurația exactă, percentilele, inputul și debitul simulat respectă manifestul 203 și probele 218; GPU/memoria indisponibile sunt declarate.

## Verificare

Documentează baseline-ul înainte de optimizări.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '155' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
