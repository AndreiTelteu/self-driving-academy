---
id: "091"
title: "Validator și fixtures pentru demonstrații"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["090","004"]
owner: "Codex gpt-6-luna medium telemetry-fixtures-01"
started_at: "2026-10-19T16:05:46+03:00"
completed_at: "2026-10-19T16:29:29+03:00"
---

# 091 Validator și fixtures pentru demonstrații

## Obiectiv

Creează fixture-uri valide, fără dovezi și corupte pentru toate contextele V1.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 090 trebuie să existe în Done înainte de începere.
- PBI 004 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Datele corupte sunt respinse cu motiv verificabil.
- [x] Lipsa unui STOP este reprezentată ca neobservat, nu conformare zero.

## Verificare

Rulează validatoarele pe toate fixture-urile.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `validateDemonstrationFixture` în `src/telemetry/demonstration-fixtures.ts`, exportat prin `src/telemetry/index.ts`, validează fiecare fixture compunând contractele reale 085–090: tickurile trec prin recorderul 085, ciclurile de oportunitate prin registrul 086, faptele prin 087, discontinuitățile prin filtrul 088, prerectivele prin normalizatorul 089 și segmentul închis prin compactorul 090. Fiecare respingere poartă un `reasonCode` din vocabularul închis, `fieldPath` și `offendingValue`, nu un boolean generic. Corpusul din `tests/telemetry/fixtures/corpus.ts` are 24 de fixture-uri valide (toate cele 10 etichete/clase 087, toate cele 5 tipuri 086 cu rezultat resolved și truncated, cele 3 artefacte 088 și cazul explicit `STOP/NOT_OBSERVED`) și 11 variante corupte, fiecare cu motivul și calea așteptate. `stopComplianceRatio` refuză `NOT_OBSERVED` și denominatorul zero cu motiv explicit, deci absența unui STOP nu poate deveni 0% conformare. CLI-ul `scripts/validate-telemetry-fixtures.mjs` rulează corpusul și iese ne-zero dacă o corupție este acceptată sau un fixture valid este respins.

Verificări executate și rezultat:
- Implementator (worktree izolat, Node 24.21.0/npm 11.19.0 prin Volta): `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1024/1024 PASS; `tests/telemetry/demonstration-fixtures.test.ts` 5/5 PASS.
- Orchestrator, re-rulare independentă pe starea integrată (`8a70cb6a`): `npm run check` EXIT 0 — 1024 teste, 1024 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0.
- CLI rulat de orchestrator pe corpusul complet: 24 valide, 11 corupte respinse, `failures=0`, exit 0; `--corrupted-only`: 11 respinse, `failures=0`, exit 0. Fiecare variantă coruptă raportează codul și calea așteptate (ex. `bad-non-monotonic-tick REJECTED reason=NON_MONOTONIC_TICK path=ticks[2]`, `bad-missing-stop-marker REJECTED reason=NOT_OBSERVED path=stopOpportunity`).
- Testul `missing STOP stays NOT_OBSERVED and cannot produce a compliance ratio` compară refuzul cu o implementare plauzibil greșită `() => 0`, deci o revenire la 0% ar eșua.
- Dovezile verbatim și cele două rulări de corpus: [Evidence/091-telemetry-fixtures](../../Docs/Evidence/091-telemetry-fixtures/README.md).

Fișiere și documente actualizate: `src/telemetry/demonstration-fixtures.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/demonstration-fixtures.test.ts` (nou, 5 teste), `tests/telemetry/fixtures/corpus.ts` (nou, 24 valide + 11 corupte), `scripts/validate-telemetry-fixtures.mjs` (nou), [Docs/telemetry-fixtures.md](../../Docs/telemetry-fixtures.md) (nou), [Docs/09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md), `Docs/Evidence/091-telemetry-fixtures/`.

Limitări sau follow-up: Compoziție deterministă nativă, fără wiring live, renderer, gameplay real sau transport worker; vizibilitatea 087 folosește intrarea documentată de fixture controlat, nu camera browser sau raycast de ocluzie. Fixture-ul de recovery 088 poartă o plasare 030 validă de contract, dar nu execută o plasare live. Validatorul semantic este deliberat îngust: contradicția etichetă/fapte este implementată pentru `FREE_TRAFFIC` + coliziune, nu ca un motor general de fapte independente; restul corupțiilor sunt structurale sau prinse de contractele 085–090. Nu se pretinde browser, GPU, FPS, memorie sau persistență.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '091' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `8a70cb6a`): validator compus peste 085–090, corpus de 24 fixture-uri valide și 11 corupte, `stopComplianceRatio` care refuză `NOT_OBSERVED`, CLI cu exit ne-zero la acceptarea unei corupții. Integrat prin fast-forward în `main`; verificările orchestratorului au reprodus 1024/1024 și ambele rulări de corpus.
