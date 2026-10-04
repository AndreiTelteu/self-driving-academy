---
id: "007"
title: "Evenimente și procesare idempotentă"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["005","006"]
owner: "Codex gpt-6.1-sol / pbi007_event_bus"
started_at: "2026-10-05T00:43:19.6411887+03:00"
completed_at: "2026-10-05T00:49:23.9092858+03:00"
performance_checks: ["simulation", "memory"]
---

# 007 Evenimente și procesare idempotentă

## Obiectiv

Implementează transportul local de evenimente cu eventId și tick.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Evenimentele duplicate nu dublează efecte sau recompense.
- [x] Listeners se pot dezabona și ordinea declarată este verificabilă.

## Verificare

Testează duplicate, unsubscribing, ordinea dintr-un tick, validarea lumii, reentrancy, erorile listeners și plafoanele fail-closed. Citește Docs/25-performanta-contracte-si-benchmark.md. Păstrează baseline pe fixture-ul CPU disponibil și compară aceeași probă după implementare; măsoară separat costul busului și contoarele dedup/listeners. Bugetele sunt provizorii înainte de 203; proba CPU nu dovedește FPS/GPU.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Bus local sincron validat, ordine stabilă, unsubscribe imediat, dedup bounded fail-closed, invalidare explicită de epoch, reentrancy respinsă și failures at-most-once documentate. Nu implementează gameplay/rewards.

Verificări executate și rezultat: 7/7 teste007 PASS; lint/format scope PASS; arhitectură PASS; typechecks și build PASS. Baseline/after CPU cu cinci probe, cost nou separat și contoare retenție/disposal în Docs/Evidence/007-event-bus/dovezi.txt. Primele verificări globale au identificat cod010/011 încă în lucru, consemnat exact; check final integrat deținut de părinte.

Fișiere și documente actualizate: src/simulation/event-bus.ts, src/simulation/index.ts, tests/events/event-bus.test.ts, scripts/benchmark-event-bus.mjs, Docs/event-bus.md și Docs/Evidence/007-event-bus/*.txt. Linkurile Docs02/README sunt integrate de părinte.

Limitări sau follow-up: Dedup volatil numai pe durata busului/epochului; fără tranzacții/rollback extern sau retry al listenerilor eșuați. Capacitatea suspendă admiterea; recuperarea explicită aparține integrării. Listeneri exclusiv sincroni. Input temporar mare și costul listenerilor nu sunt plafonate de bus. CPU microbenchmark nu închide bugetul hardware/FPS/whole-tick.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '007' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T00:49:23.9122530+03:00: Implementare007 și verificări relevante încheiate; baseline CPU înainte/după, cost nou separat, at-most-once explicit. Mutare fizică în Done și validare obligatorie.

- 2026-10-05T01:02:26.4011557+03:00: Validare integrată de părinte pentru lotul 007/010/011: npm run check PASS (87 teste), npm run build PASS; Validate-Board -RequireDone 007,010,011 și Validate-Plan PASS. Loguri: Docs/Evidence/011-render-boot/integration-check.txt și integration-build.txt. Avertismentul Vite pentru bundle >500 kB rămâne documentat, fără suprimare.
