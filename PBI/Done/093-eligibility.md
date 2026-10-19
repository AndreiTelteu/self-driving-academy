---
id: "093"
title: "Eligibilitate și dovezi pe parametru"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["092","091"]
owner: "Codex gpt-6-luna medium learning-evidence-01"
started_at: "2026-10-19T16:32:08+03:00"
completed_at: "2026-10-19T16:51:30+03:00"
---

# 093 Eligibilitate și dovezi pe parametru

## Obiectiv

Mapează contexte și observații efective pentru fiecare cheie M.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 092 trebuie să existe în Done înainte de începere.
- PBI 091 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cadrele corelate nu devin oportunități independente.
- [x] Parametrii fără dovezi rămân nemodificați.

## Verificare

Testează demonstrație fără STOP și episoade repetate la același eveniment.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `createParameterEvidenceLedger` și `parameterEvidenceSpecs` în `src/learning/parameter-evidence.ts`, exportate prin `src/learning/index.ts`. Specificațiile acoperă exact cele 24 de chei `initial_learning_target` din registrul 092, cu unitatea, intervalul, contextul 087, canalul de observație, pragul de episoade/timp și proprietarul estimatorului (094–099, patru chei fiecare); un check la încărcare respinge orice acoperire incompletă sau cheie în plus. Ledgerul consumă fapte 086/087/088/089 reale: cere oportunitate 086 `RESOLVED` și eligibilă pentru learning, potrivire de ID/fereastră/segment/vehicul/incarnation, prefix 088 utilizabil și refuză ferestrele EXCLUDED sau EXTERNAL_CONSTRAINT în afara contextului propriu. Deduplicarea este pe `opportunity.id + opportunity.occurrence`, deci 20 de cadre corelate ale aceluiași STOP rămân un episod, iar o apariție nouă adaugă unul. Read model-ul este înghețat, nu conține valoare sau delta, iar starea `NO_EVIDENCE`/`INSUFFICIENT` produce `unchanged: true` cu motiv explicit; `READY` înseamnă doar prag de dovezi atins, cu `ESTIMATOR_NOT_IMPLEMENTED`, deci 092 rămâne cu `estimable=false` și `implemented` neschimbat.

Verificări executate și rezultat:
- Implementator (worktree izolat): `npm test` 1032/1032 PASS, `check:architecture` exit 0, `check:parameter-catalog` exit 0. Typecheck/lint/format au lipsit la implementator (binare locale indisponibile, `npm ci` neterminat) și au fost rulate de orchestrator.
- Orchestrator, pe starea integrată (`dcf967a6` + corecțiile de integrare): `npm run check` EXIT 0 — typecheck, lint, format:check, architecture și 1032 teste (1032 pass, 0 fail); `npm run check:parameter-catalog` EXIT 0.
- Corecții de integrare făcute de orchestrator: proprietarul estimator era `095` pentru toate cele 24 de chei; l-am mapat pe PBI-urile 094–099 (viteză → 094, longitudinal → 095, following → 096, semnale → 097, STOP/yield → 098, bandă → 099) și am adăugat o aserțiune care cere exact patru chei per proprietar; am completat `OpportunityStimulusView` în fixture-ul de test (typecheck-ul lipsea la implementator) și am formatat fișierele cu Prettier.
- Testele acoperă: cele 24 de chei și unități/limite identice cu 092; lipsa unui STOP → `NO_EVIDENCE`, `unchanged`, fără valoare/delta; 20 de cadre corelate → 1 episod, occurrence nouă → 2; viteză doar în FREE_TRAFFIC cu 10 s utilizabile; following insuficient la o singură viteză; prefix 088 TRUNCATED contribuie, FULLY_SUPPRESSED și EXCLUDED nu.
- Dovezile implementatorului: [Evidence/093-learning-evidence](../../Docs/Evidence/093-learning-evidence/README.md).

Fișiere și documente actualizate: `src/learning/parameter-evidence.ts` (nou), `src/learning/index.ts`, `tests/learning/parameter-evidence.test.ts` (nou), [Docs/learning-evidence.md](../../Docs/learning-evidence.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/093-learning-evidence/`.

Limitări sau follow-up: Nu este estimator și nu calculează valoare/delta; nu activează `implemented`/`estimable`, nu publică profiluri și nu implementează 094–108. Statusul de proprietar al estimatorului este o mapare de plan, nu o integrare: 094–099 încă nu există. `EXCLUDED` este declarat în vocabularul read model dar nu este produs de politicile actuale (ferestrele excluse nu contribuie, deci cheia rămâne `NO_EVIDENCE`); de decis la 100 dacă un motiv de excludere per cheie trebuie expus. Calitatea/incertitudinea sunt descriptive (1/0, MODERATE/HIGH), nu statistice. Fără browser, GPU, FPS sau integrare live.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '093' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `dcf967a6`): ledger de dovezi pe cele 24 de chei M, deduplicare pe id+occurrence, `unchanged` fără dovezi, praguri din Docs/10 și mapare pe 094–099. Orchestratorul a rulat verificările statice lipsă, a corectat maparea proprietarilor (toate erau 095) și tipul fixture-ului, apoi a integrat prin fast-forward în `main`.
