---
id: "037"
title: "STOP linii și oprire completă"
status: "Done"
release: "V1"
module: "Oraș"
performance_checks: ["simulation", "memory"]
depends_on: ["033","007"]
owner: "Codex6.1-Sol medium /root/pbi014"
started_at: "2026-10-05T03:58:02.8507913+03:00"
completed_at: "2026-10-05T04:17:19.2751362+03:00"
---

# 037 STOP linii și oprire completă

## Obiectiv

Definește zone STOP, linie de trecere și praguri de oprire.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 033 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Oprirea completă și traversarea sunt evenimente distincte.
- [x] Un vehicul lent care nu se oprește nu este etichetat automat ca oprire completă.

## Verificare

Testează oprire, rolling stop și trecere fără frână. Citește contractul Docs25; capturează baseline CPU înainte de producerul pe tick, compară aceeași probă și costul nou separat, cu limite explicite pentru istoricul observat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Zone STOP readonly pe geometrie world/graph033 și producer tick-addressed pentru evenimente007 STOP_APPROACH, FULL_STOP și STOP_LINE_CROSSED cu opportunityId comun și eventId distinct. Oprirea completă cere viteză aproape zero, deplasare cumulată sub toleranță și intervale staționare consecutive în zona dinaintea liniei; rolling/slow drift nu devin automat FULL_STOP. Contactul pe linie este distinct de trecerea efectivă. Context/epoch/incarnation/ticks și istoria bounded împiedică transferul dovezii între lumi/respawn/opportunities.

Verificări executate și rezultat: 10/10 teste STOP PASS (oprire, rolling stop, slow drift, fără frână, contact/traversare, gap/teleport, sens invers, înălțime/capete finite, ID reuse/reset, idempotency007, readonly/capacitate, două STOP-uri). npm run check PASS255; npm run build PASS; Validate-Plan PASS. Baseline/after CPU înainte/după, cost nou și20 cicluri cleanup: [verification.md](../../Docs/Evidence/037-stop-rules/verification.md). Node24/Ryzen7950X3D,10000 observații×5: p95 median producer0,0067ms, proiecție nemodificată0,0003→0,0005ms (+0,0002ms raportat, baseline păstrat). Maximum1 oportunitate reținută pervehicul;20 cicluri1/1/1→0/0/0 pentru vehicule/incarnations/opportunities. Limite default128/4096, fail-closed verificat.

Fișiere și documente actualizate: src/world/stop-rules.ts; tests/world/stop-rules.test.ts; scripts/benchmark-stop-rules.mjs; [Docs/stop-rules.md](../../Docs/stop-rules.md); Docs/Evidence/037-stop-rules/{baseline.json,after.json,verification.md,board.json}. Exporturile publice world și linkurile comune sunt integrate de părinte.

Limitări sau follow-up: Producer semantic cu observații sintetice explicite, fără browser/playtest/fizică/controller încă. Callerul trebuie să furnizeze bara frontală autoritară, contextul, date de viteză și discontinuitățile reale. Toleranțele numerice și dwell necesită calibrare pe fizică; nu atribuie automat FULL_STOP respectării STOP sau learning-ului. Microbenchmark CPU nu certifică tick complet/FPS/GPU/memorie exactă; budgets203/218–224 rămân distincte. Dispose elimină istoria dinamică; geometria statică se eliberează când ownerul elimină controllerul.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '037' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T04:17:19+03:00: Semantica STOP implementată și verificată, 10 teste dedicate și check255/build/Plan PASS; mutare fizică obligatorie în Done, RequireDone037 după mutare.
