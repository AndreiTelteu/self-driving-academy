---
id: "100"
title: "Incertitudine praguri și număr efectiv"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["094","095","096","097","098","099"]
owner: "Codex gpt-6-luna medium evidence-confidence-01"
started_at: "2026-10-20T00:36:00+03:00"
completed_at: "2026-10-20T00:52:00+03:00"
---

# 100 Incertitudine praguri și număr efectiv

## Obiectiv

Definește calitatea, pragurile și indicatorii de incertitudine ai estimatorilor.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 094 trebuie să existe în Done înainte de începere.
- PBI 095 trebuie să existe în Done înainte de începere.
- PBI 096 trebuie să existe în Done înainte de începere.
- PBI 097 trebuie să existe în Done înainte de începere.
- PBI 098 trebuie să existe în Done înainte de începere.
- PBI 099 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Neobservat, dovezi slabe și valoare zero sunt stări distincte.
- [x] Numărul efectiv nu este doar numărul eșantioanelor la 20 Hz.

## Verificare

Testează intervale scurte, episoade corelate și dovezi contradictorii.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/learning/evidence-confidence.ts` (exportat prin `src/learning/index.ts`) definește `parameterConfidenceThresholds`/`confidenceThreshold` pentru exact cele 24 de chei M (derivate din specificațiile 093), `assessEvidenceConfidence`, `summarizeEvidenceQuality` și `assessEstimatorConfidence` pentru rezultatele reale 094–099. Numărul efectiv se calculează pe identitatea episodului: cadrele se unesc pe `opportunityId + occurrence` păstrând expunerea maximă, grupurile `correlatedWith` sunt colapsate la membrul cel mai expus, fiecare reprezentant este ponderat cu `min(1, observedTicks / minimumEpisodeTicks)` și abia apoi însumat; `sampleCount`, `frameObservationCount` și `observationCount` nu intră niciodată în număr. Pragul de expunere este 600 tick-uri pentru cheile de viteză și 30 tick-uri pentru restul. Stările `UNOBSERVED`, `WEAK`, `ZERO` și `OBSERVED` sunt distincte: un zero real cu dovezi suficiente rămâne `ZERO`, nu devine „neobservat"; detaliul de episoade trebuie să coincidă cu `read.distinctEpisodes`, altfel rezultatul este `WEAK`. Contradicțiile numerice în interiorul unui grup comportamental sunt raportate ca interval: peste 15% din intervalul parametrului → `MODERATE` (OBSERVED, incertitudine HIGH, calitate ×0,6), peste 50% → `SEVERE` (WEAK, valoare null, interval păstrat); acceptat vs refuzat suprapus și interval inversat → `SEVERE`, cu motivele `ACCEPTED_AND_REFUSED_OVERLAP`, `CONTRADICTORY_EPISODE_VALUES`, `DISPERSED_EPISODE_VALUES`, `INVERTED_ESTIMATOR_INTERVAL`.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (170 fișiere), `check:parameter-catalog` exit 0; `npm test` 1072/1072 PASS (1062 baseline + 10); suita țintă `tests/learning/evidence-confidence.test.ts` 10/10, iar testele țintă 093–099 plus noua suită 33/33. Dovezi verbatim în [Evidence/100-evidence-confidence](../../Docs/Evidence/100-evidence-confidence/README.md).

Fișiere și documente actualizate: `src/learning/evidence-confidence.ts` (nou), `src/learning/index.ts`, `tests/learning/evidence-confidence.test.ts` (nou), [Docs/evidence-confidence.md](../../Docs/evidence-confidence.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/100-evidence-confidence/`.

Limitări sau follow-up: identitatea de occurrence, expunerea măsurată și grupurile de corelare sunt furnizate de apelant; fracțiile de contradicție raportate la intervalul parametrului și pragul de 30 tick-uri sunt politică provizorie, nu semnificație statistică. Nu există interval de încredere statistic/bootstrap, worker, persistență, buclă live, publicare de profil, schimbare a flagurilor 092, rulare în browser sau probă de performanță.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '100' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `da1b5599`): praguri pe cele 24 de chei, număr efectiv pe episoade distincte, stări UNOBSERVED/WEAK/ZERO/OBSERVED și contradicții ca interval, cu 10 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1072/1072 teste.
