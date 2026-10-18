---
id: "232"
title: "Director de provocări random și curse speciale"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["231","225","061","063","064","219"]
performance_checks: ["simulation", "memory", "storage"]
owner: null
started_at: null
completed_at: null
---

# 232 Director de provocări random și curse speciale

## Obiectiv

Oferă provocări opționale variate fără întreruperea cursei existente și urmărește lifecycle-ul cu seed salvat.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 231 trebuie să existe în Done înainte de începere.
- PBI 225 trebuie să existe în Done înainte de începere.
- PBI 061 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 064 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] O singură ofertă/provocare, cooldown și istoric anti-repetiție plafonat; toggle oprește ofertele, iar refuzul este fără penalizare.
- [ ] Preflight verifică sesiunea, taxiul liber, ruta/zonele/evaluatorii și deadline fezabil înainte de ofertă; catalog mic are fallback stabil.
- [ ] Acceptarea rezervă taxiul, suspendă dispatchul lui și folosește pickup/dropoff comun; pasagerul existent nu este abandonat.
- [ ] Instanța salvează obiective/seed/timp/cursor/sessionId/worldEpoch; pauza, reload, schimbarea mașinii, R/reset și duplicatele au rezultate explicite.
- [ ] Interogările și generarea respectă schedulerul/bugetele fără rerandomizare per frame sau rularea unor lumi suplimentare.

## Verificare

Testează refuz/expirare, pause/deadline, reload, pasager existent, traseu inaccesibil, catalog mic, R/reset, schimbare mașină și istoric lung.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [ ] Contracte/documentație actualizate.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '232'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
