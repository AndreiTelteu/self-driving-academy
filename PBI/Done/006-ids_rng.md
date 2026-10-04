---
id: "006"
title: "Identificatori stabili și random determinist"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["005"]
owner: "Codex /root/pbi006_ids_rng"
started_at: "2026-10-05T00:29:39.1483294+03:00"
completed_at: "2026-10-05T00:34:57.6923423+03:00"
---

# 006 Identificatori stabili și random determinist

## Obiectiv

Creează IDs de entități și seed-uri pe vehicul, scenariu și oportunitate.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Același seed și aceeași cheie de oportunitate reproduc eșantionarea.
- [x] Alte evenimente nu modifică arbitrar randomul unei oportunități existente.

## Verificare

Compară secvențe cu evenimente inserate și seed-uri diferite.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: IDs v1 injective prin componente length-prefixed UTF-16; seed-uri uint32 versionate pe scenariu/vehicul/oportunitate și eșantioane adresate prin purpose/index, independente de ordinea/inserarea altor apeluri. API public sessions, fără stare RNG globală.

Verificări executate și rezultat: 7/7 teste identitate/RNG PASS, golden vectors, Unicode/delimitatori, evenimente inserate/reordonate, seed-uri diferite, restart JSON și intrări invalide. npm run check PASS (typecheck, lint, format, architecture și 59/59 teste); npm run build PASS. Dovezi exacte: Docs/Evidence/006-identity-tests.txt, 006-check.txt, 006-build.txt și 006-board.txt. Prima probă check s-a oprit în format la fișierele concurente 009/092; după formatarea lor aceeași comandă a trecut.

Fișiere și documente actualizate: src/sessions/identity.ts, random.ts, index.ts; tests/identity/identity-random.test.ts; Docs/identity-random.md; Docs/Evidence/006-*.txt și acest PBI. Include-ul testelor și legăturile în documentele comune sunt gestionate de agentul principal.

Limitări sau follow-up: Hash non-criptografic uint32, cu coliziuni posibile, documentat explicit; consumatorii aleg/persistă chei semantice stabile și indexuri. Nu implementează lifecycle de entități, checkpoint/persistare sau determinismul fizicii între platforme; acestea aparțin PBI-urilor dedicate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '006' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T00:34:57.6942621+03:00: Implementare 006 verificată; check 59/59 și build PASS; mutare fizică în Done urmată de validator RequireDone 006.
