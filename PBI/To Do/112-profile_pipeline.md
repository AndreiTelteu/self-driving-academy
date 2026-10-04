---
id: "112"
title: "Integrare intervenție estimator și publicare"
status: "To Do"
release: "V1"
module: "Profiluri"
depends_on: ["111","103","204"]
owner: null
started_at: null
completed_at: null
---

# 112 Integrare intervenție estimator și publicare

## Obiectiv

Integrează serviciile extinse de segment, estimator și activare; gate-ul final 108 nu blochează integrarea înainte de release.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 111 trebuie să existe în Done înainte de începere.
- PBI 103 trebuie să existe în Done înainte de începere.
- PBI 204 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Segmentele LEARNING sunt analizate automat; MANUAL nu creează joburi de learning sau versiuni.
- [ ] No-change nu creează profil; rezultatele depășite în aceeași generație sunt recompuse explicit.

## Verificare

Parcurge două intervenții consecutive și verifică versiunile.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '112' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
