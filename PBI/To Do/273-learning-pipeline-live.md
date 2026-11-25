---
id: "273"
title: "Pipeline-ul de learning live: dovezi, worker, profil și activare"
status: "To Do"
release: "V1"
module: "Moduri și learning"
depends_on: ["272"]
performance_checks: ["workers","simulation"]
owner: null
started_at: null
completed_at: null
---

# 273 Pipeline-ul de learning live: dovezi, worker, profil și activare

## Obiectiv

Un segment LEARNING eligibil produce un candidat, o versiune imuabilă și o activare pentru toate taxiurile și civilii, iar un segment fără dovezi nu produce versiune.

## Starea actuală și ce lipsește

- Nu există coadă de joburi, worker sau governor conectat la compunerea live.
- Nu există store de profil, versiune de bază sau istoric de versiuni în joc.
- Nu există activarea profilului la tick comun pentru taxiuri și civili.
- Nu există bariera `learningEpoch` la restore/import/profil nou.
- Nu există refuz pentru MANUAL, segment incomplet, job învechit sau dovezi insuficiente.
- Nu există o probă de browser în care stilul orașului se schimbă după o demonstrație.

## Context și plan

- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Profiluri și propagare](../../Docs/12-profiluri-si-propagare.md)
- [Worker-ul de learning](../../Docs/learning-worker.md)
- [Pipeline-ul de profil](../../Docs/profile-pipeline.md)
- [Activarea profilului](../../Docs/profile-activation.md)
- [Bariera de generație](../../Docs/learning-epoch.md)
- [Bucla timpurie de learning](../../Docs/early-learning-loop.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 272 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Un segment LEARNING eligibil închis produce un job; MANUAL și LEARNING neeligibil sunt sărite fără job.
- [ ] Rezultatul trece prin dovezi, încredere, blend, poartă numerică și compunere, fără valori inventate.
- [ ] O compoziție schimbată produce o versiune imuabilă și o activare la tick comun pentru toate vehiculele.
- [ ] O compoziție neschimbată sau cu dovezi insuficiente produce `NO_CHANGE`/`INSUFFICIENT_EVIDENCE`, fără versiune.
- [ ] Restore/import/profil nou incrementează `learningEpoch`, anulează joburile vechi și păstrează starea fizică.
- [ ] Un job târziu sau dintr-o altă generație este `STALE_JOB` și nu publică.

## Verificare

- Raport end-to-end pe segment real, worker și activare.
- Scenarii pentru MANUAL, no-change, stale, restore și import.
- Probă în browser: conduce LEARNING, vezi profilul publicat și efectul în flotă.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '273'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
