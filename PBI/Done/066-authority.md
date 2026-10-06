---
id: "066"
title: "Arbitraj de comenzi și autoritate"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["024","025","007"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium authority-01"
started_at: "2026-10-06T00:43:10.078Z"
completed_at: "2026-10-06T01:46:41.185Z"
---

# 066 Arbitraj de comenzi și autoritate

## Obiectiv

Rezolvă autoritatea AUTO sau PLAYER la fiecare tick; PLAYER are modul MANUAL sau LEARNING și nu necesită dispecerul/flota completă.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 025 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Maximum un vehicul este în MANUAL sau LEARNING; controllerul și limitele fizice sunt comune.
- [x] Comenzile AI încetează la tick-ul preluării; toate tranzițiile păstrează starea fizică.

## Verificare

Testează comenzi concurente și schimbări în același tick.

Înaintea implementării pe tick, arhivează baseline-ul pe fixture-ul nativ024/025 disponibil; compară același protocol AFTER și costul suplimentar066 conform Docs/25-performanta-contracte-si-benchmark.md și manifestului203. Ownership-ul arbitrajului trebuie plafonat; tranzițiile și probele browser pe backendurile reale păstrează mecanica și nu substituie FPS hardware prin Node.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Coordinator input066 peste controllerul fizic024 existent, maximum110 identități native exacte și un loc PLAYER. Batchurile contradictorii sunt respinse înaintea efectelor; transferul simultan și schimbarea MANUAL/LEARNING păstrează inputul adresat și mecanica. Curățarea inputului părăsit urmează publicarea stării acceptate; un callback eșuat produce fault terminal explicit, fără rollback fictiv.

Verificări executate și rezultat: BEFORE cronologic3917ae4172c6f60944704f1ab2fb29d7dfe71c793b99150eca1b16453037edcd în34 lumi native, înaintea producției066; AFTER7325186177571c6b867cbb347ba9aaec88edfdc76545c7887fb923071dc97d06 în același protocol. Comenzile, inputul brut, checkpointurile și digesturile fizice sunt exact egale;0/5 regresii relative pentru70 și110 vehicule. Normal70p95 3.089–3.318ms sub5.5ms; overload1104.198–4.408ms raportat separat; overhead coordinatorp95 .0261–.0295ms/.0321–.0414ms. Verificatorii BEFORE istoric și AFTER curent au trecut independent în parent. Testele child468 au trecut, inclusiv20 cicluri lifecycle/capacitate și fault/reentry/token/admission. Chrome real AUTO→WEBGPU și WEBGL2: PASS sedan/compact720ticks fiecare, continuitate, AI exclus la preluare, batch contradictoriu fără efect și suspend fără avans. Verificatorul browser curent și rehashul byte-exact al tuturor144 intrări ZIP au trecut independent. Source browser2d08bac0b46d146f899eb1a498b6b4056fd8c61e0d5dec2408293ed28fbe4e18/artifactb9ffc0c5fcde761e2424423aceb9a6a2cddd81efc63f99443cad5590c1779bbd; rapoarte în Docs/Evidence/066-control-authority. Merge fără rescrierea istoriei d168224f în main; npm run check integrat PASS468, log checks-main.txt. Mutare fizică în Done; Validate-Board.ps1 -RequireDone 066 și Validate-Plan.ps1 PASS. Audit separat GitINDEX PASS170 rânduri runtime acceptate,168 byte-exact în checkout și două diferențe numai CRLF/LF pentru bugetul existent; runtime și arhivele sunt byte-exact în GitINDEX. Verificatorii strict originali sunt neschimbați.

Fișiere și documente actualizate: src/input/control-authority.ts și exportul input/index, teste input/reference, benchmarkuri native, fixture browser control-authority, Docs/control-authority.md și arhivele/verificatorii Docs/Evidence/066-control-authority; modulul08 și indexul Docs/README actualizate de parent.

Limitări sau follow-up: Probe timpurii pe controllerul024, input025 și două clase; fără dispecer complet, segmente/cozi learning, taste fizice în proba scriptată, FPS flota/joc complet, heap total sau certificare laptop. Captura34 lumi păstrează contoarele live066 și executarea dispose, fără contoare066 post-dispose serializate;20 cicluri independente verifică eliberarea lor. Erorile inițiale de verificare sunt păstrate, inclusiv comparația greșită a forțelor/direcției/frânării dinamice cu valorile inițiale. Repararea browserului compară exact parametrii mecanici constanți și păstrează citirile dinamice separat; fizica și pragurile sunt neschimbate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '066' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-06T04:47:14.7230440+03:00: Integrare validată,468 teste main,34 lumi native și ambele backenduri Chrome PASS; mutare fizică în Done și validatori board/plan PASS,170 rânduri runtime GitINDEX verificate. Capturile eșuate și limitele sunt păstrate în evidence.
