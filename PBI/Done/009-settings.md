---
id: "009"
title: "Configurare runtime și preferințe"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["005"]
owner: "Codex /root/pbi009_settings"
started_at: '2026-10-05T00:29:51.6929787+03:00'
completed_at: '2026-10-05T00:36:18.5625644+03:00'
---

# 009 Configurare runtime și preferințe

## Obiectiv

Definește setări pentru input, unități, calitate și configurația scenariului.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Setările sunt validate separat de parametrii învățați.
- [x] Resetul setărilor nu șterge profilurile sau progresul.

## Verificare

Testează valori valide, invalide și reset independent.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: modul settings pur cu contracte schemaVersion=1 pentru input/ControlPreferences, unități, calitate și scenariu; validare unknown strictă, copii înghețate și store atomic. Setările sunt distincte de DrivingProfile; resetul păstrează playerId și nu poate modifica profiluri/progres. Revizii control monotone și no-op fără versiuni artificiale; helper string pentru controlPreferencesVersion.

Verificări executate și rezultat: npm run check PASS (60/60 teste globale, 9 settings; typecheck, lint, format, architecture PASS); npm run build PASS exit0. Probe valide/invalide, conflicte input, FOV/camera stabilă, reset independent, atomicitate, copii, control revizii/no-op/exhaustion. Logs reale: [dovezi](../../Docs/Evidence/009-settings/README.md), check.txt și build.txt. Rezultatul final Validate-Board.ps1 -RequireDone 009 este în board.txt după mutarea fizică.

Fișiere și documente actualizate: src/settings/{contracts,store,index}.ts; tests/settings/settings.test.ts; Docs/runtime-settings.md; Docs/Evidence/009-settings/{README.md,dovezi.txt,check.txt,build.txt,board.txt}; PBI009. Integrarea shared architecture/test include și Docs02 este deținută de agentul părinte.

Limitări sau follow-up: defaulturile și mappingVersion provisional-v1 sunt declarate provizorii, fără calibrare hardware203 sau mapping fizic025; UI229, aplicare pe tick, persistență și input/cameră live sunt task-uri distincte. Configurația scenariului validează forma, nu existența hărții sau admiterea populației în buget.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '009' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-05T00:36:18.5625644+03:00: implementare009 și probe reale PASS; mutat fizic în Done; Validate-Board.ps1 -RequireDone 009 executat după mutare, rezultat în Docs/Evidence/009-settings/board.txt.
