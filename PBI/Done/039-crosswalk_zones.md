---
id: "039"
title: "Treceri de pietoni și semantică de pericol"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["032"]
owner: "Codex /root"
started_at: "2026-10-05T03:37:50.1362914+03:00"
completed_at: "2026-10-05T03:47:34.6755643+03:00"
performance_checks: ["simulation", "memory"]
---

# 039 Treceri de pietoni și semantică de pericol

## Obiectiv

Adaugă zone și linii pentru treceri și obstacole.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 032 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Zonele au IDs și pot alimenta viitoarele scenarii cu pietoni.
- [x] Absența pietonilor nu produce dovezi fictive de cedare.

## Verificare

Verifică traversări geometrice și oportunități fără pietoni.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: zone readonly cu IDs, poligoane, linii și query swept în 3D; observații explicite distincte pentru pietoni/obstacole, fără rezultate fictive de cedare.

Verificări executate și rezultat: 7/7 teste semantice, scoped ESLint/Prettier PASS; baseline before/after și 20 de cicluri de retenție CPU executate. Verificarea finală a indexului este arhivată în Docs/Evidence/039-crosswalk-zones.

Fișiere și documente actualizate: src/world/crosswalk-zones.ts și exporturi; teste, benchmark, Docs/crosswalk-zones.md, modulul04 și README.

Limitări sau follow-up: modul semantic fără NPC-uri, collider-e sau rezultate de learning; anvelopă verticală explicită pentru poligoane; geometria și capacitățile hărții reale necesită calibrare. Vezi raportul de dovezi.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '039' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-05T03:47:34.6779095+03:00: Implementare și verificări semantice complete; mutare fizică în Done, urmată de validarea obligatorie.
