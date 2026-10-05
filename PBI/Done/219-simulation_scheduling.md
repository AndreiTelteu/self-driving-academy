---
id: "219"
title: "Scheduler de simulare și protecție la suprasarcină"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["008","010","044","218"]
performance_checks: ["simulation", "frame", "memory"]
owner: "Codex gpt-6.1-sol medium PBI219"
started_at: "2026-10-05T16:02:08.0229099+03:00"
completed_at: "2026-10-05T18:05:01.530Z"
---

# 219 Scheduler de simulare și protecție la suprasarcină

## Obiectiv

Distribuie determinist deciziile de trafic și bugetează tick-uri/context/rutare fără a schimba timpul sau stilul.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fizica/controllerul rămân la 60 Hz; deciziile 10 Hz sunt distribuite după entityId, iar inputul și evenimentele urgente nu așteaptă slotul periodic.
- [x] Recuperarea are plafon de pași și păstrează datoria; suprasarcina produce pauză explicită, fără dt mărit, tick-uri sărite sau revenue/XP fictiv.
- [x] Cozile/cache-urile au limite, invalidare și ordonare reproductibilă; camera nu schimbă simularea sau vecinii relevanți.

## Verificare

Testează 30/60/120 FPS, hitch, background, toate deciziile scadente simultan, semnal urgent, selecție și blocaje de rutare; compară evenimentele și debitul de simulare.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: scheduler pur cu porturi structurale, fizică/controller la 60 Hz și decizii periodice în șase faze stabile de 10 Hz după entityId. Inputul și evenimentele urgente sunt independente de fază. Guardul beforeStep oprește admiterea când publicarea 028 este pending; faulturile sunt terminale, fără retry al efectelor. Coada are 16 joburi și un task rezident; cache-ul are 64 de rute versionate. Identitățile, session/epoch/incarnation, reset și dispose sunt verificate. Nu introduce gameplay 045 ori schimbări de stil. [Contract](../../Docs/simulation-scheduling.md).

Verificări executate: nucleul corectat are 23/23 teste PASS în recaptura anterioară (395,0369 ms), typecheck, architecture și scoped lint/format PASS. După reluarea din 2026-10-05, noile main/index/protocol/workload/server au scoped format/lint și full typecheck PASS. Reverificarea independentă a celor 96 inputuri arhivate corrected-core PASS; hashurile surselor curente corespund. Încă 23/23 teste targeted PASS (392,3936 ms). Buildul production al fixture-ului fizic PASS (982 module, 818 ms), static HTTP200 și endpoint resume gol PASS. [Dovadă non-UI](../../Docs/Evidence/219-simulation-scheduling/resumed-nonui-checks.json). Primul smoke manual WEBGPU a rulat, dar a eșuat în cleanup-ul fixture-ului după 30 tick-uri running; raportul și cele 80 surse sunt păstrate și verificate. Fixture-ul citea world.counts după world.dispose, deși counts cere lume live. Repararea verifică ownership zero, registry disposed și refuzul citirilor native; testul actual70-car NullEngine pentru ambele arms, cleanup repetat și recuperare după factory fault PASS (355,4493 ms). Scoped lint/format, full typecheck și build reparat PASS. [Dovadă reparație](../../Docs/Evidence/219-simulation-scheduling/fixture-cleanup-repair.json). Smoke automat autorizat Computer Use în Chrome a trecut: WEBGPU capture20261005T152306050Z,20 runuri, checkpointuri semantice egale și cleanup verificat, min sim/wall0,992802. Este SMOKE_ONLY; protocolul complet hardware a trecut ulterior pe ambele backenduri, cu pragurile normale neschimbate.

Baseline-ul cronologic Node înainte de implementare este păstrat byte-exact. Recaptura corrected-core identifică sursa scheduler SHA256 `f33fa5e1d8360953b94d74008e6ac407a1ea90c4dc71b6ebc9fb192dbdb3d1bd`: cinci perechi observer off/on, 70 actori normal și 110 suprasarcină. Medianele tick callback p95 off/on sunt normal 0,5019/0,5393 ms și dense 2,0094/1,8801 ms, față de baseline 1,8465/1,8045 și 6,1717/6,1143 ms. Admiterea 044 este regiune separată: normal 1,6782/1,6377 ms, dense 5,6170/5,3365 ms. Callbackurile/checksums și identitățile sunt păstrate; percentilele nu sunt însumate. Nu aprobă FPS sau bugetul 5,5 ms al întregului joc.

Cost suplimentar corrected-core rutare: mediane p95 off/on raw search 0,0174/0,0155 ms, admitere 16 joburi 0,0990/0,1005 ms, pipeline patru tick-uri 0,1170/0,1444 ms, raportate separat. Toate runurile au 1600 taskuri/results/cleanup. Proba memory are 20 reseturi și un dispose final: 1300 taskuri create/1300 dispose, 1280 rezultate reușite, ownership final zero; heap forced-GC +418136 bytes este diagnostic de proces. [Raport CPU și limitări](../../Docs/Evidence/219-simulation-scheduling/cpu-report.md).

Fișiere: src/simulation/scheduling.ts; tests/simulation reference/scheduler/route fixture; trei scripts CPU/memory/route; tests/browser/simulation-scheduling main/index/protocol/workload; scripts/scheduling-hardware-probe-server.mjs; Docs/simulation-scheduling.md și Docs/Evidence/219-simulation-scheduling. Public barrel și documentele comune aparțin coordonatorului.

Limitări reale: CPU folosește observații statice 044 și contoare de fizică/controller, fără gameplay 024/045. Harness-ul headed pregătit leagă fizica/controllerul/publicarea reale 024/028, dar deciziile de rutare rămân sintetice, acoperirea obstacolelor contextului este explicit incompletă, GPU/exact memory pot fi indisponibile. Proba headed pe Chrome de producție, cinci perechi cu 30 s warmup +120 s măsurate pentru fiecare arm, a trecut pe WebGPU și WebGL2 (20 runuri per backend). Armul hardware unphased este control postimplementare pe același build, distinct de baseline-ul cronologic Node. Capturile se păstrează incremental și pot fi reluate cu identitate source/build/hardware verificată. [Protocol/URL/stare](../../Docs/Evidence/219-simulation-scheduling/hardware-plan.md).

Outboxul și resursele interne ale taskului sunt bounded de owner; 4 slice ×16 expansions nu preemptează JavaScript arbitrar. Plafoanele sunt finite, provizorii, fără calibrare de gameplay; camera nu reduce populația. Hardware frame PASS verificat pe ambele backenduri; finalizarea și mutarea fizică sunt încheiate, cu verificarea RequireDone de mai jos.

Verificări finale pe integrarea 219: npm run check PASS (typecheck, lint, format, architecture și 416/416 teste; raport final-npm-check.txt). Verifierul determinist current/historical a verificat ambele capturi complete, cele 80 surse și 141 artifacts din arhiva ZIP de 3447958 bytes, SHA256 58b6edd07132a0b616a8c02d20ddef71fe1d464d045f02539dc411610b725efe. Arhiva păstrează buildul testat independent de directorul temporar. Limitările reale rămân documentate.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '219'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.

- 2026-10-05T16:02:08.0229099+03:00: dependențe008/010/044/218 fizicDone; memory adăugat înainte de cozi/cache-uri. Cel mai mic ID eligibil ToDo. Pregătire light de referință/baseline; fără algoritm ori probe CPU înainte de baseline și grant exclusiv, fără modificarea closure023 înghețate.


- 2026-10-05: full Chrome WebGPU capture 20261005T152901307Z PASS:20 runs,30s warmup/120s measurement,minimum sim/wall0.9999767,300 checkpoints exact,zero cleanup ownership and no budget failures. Independent verification saved beside comparison. WebGL2 full remains pending; no Done claim.

- Reluare cu același subagent: verificare independentă WebGPU PASS. Navigarea Chrome 5196 către 5195 a fost respinsă de verificarea automată de siguranță URL la Enter. WEBGL2 nu a pornit; nicio sursă sau limită schimbată. UI/CPU eliberate; necesită navigare manuală și reluare.

- 2026-10-05: full WEBGL2 manual capture 20261005T170121469Z PASS:20 runuri,30s/120s,minimum sim/wall0.9999767,300 checkpointuri identice și cleanup zero. P95/p99 frame7/7.1ms; main-thread median reference off/on4.5/4.2ms, phased4/4ms. Un frame18.6ms păstrat; zero peste25ms și zero long tasks, fără încălcări ale pragurilor percentile ori regresii relative confirmate. WebGPU20261005T152901307Z și WEBGL2 au aceeași sursă995b6f... și artifact784022...; limitări early fixture/synthetic routes/incomplete context/exact memory/laptop păstrate.
