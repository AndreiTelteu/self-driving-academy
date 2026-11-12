---
id: "178"
title: "Învățare extinsă pentru schimbare de bandă și depășire"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["177","163"]
parameter_role: "estimator"
parameter_keys: ["lane_change_duration","signal_lead_time","signal_use_probability","pass_on_right_probability"]
owner: "loop-pbi/v2-learn-178-01"
started_at: "2026-11-13T00:20:52+02:00"
completed_at: "2026-11-13T00:44:34+02:00"
---

# 178 Învățare extinsă pentru schimbare de bandă și depășire

## Obiectiv

Construiește estimarea și dovezile pentru lane_change_duration, signal_lead_time, signal_use_probability, pass_on_right_probability. Include semnalizarea, durata manevrei și oportunități de depășire prin dreapta.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 177 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `178-lane-estimator-v2` din `src/learning/lane-v2-estimator.ts` estimează cele patru chei R ale politicii 177 din patru scenarii separate — durata mișcării laterale, avansul de semnalizare, folosirea indicatorului pe oportunitate și depășirea prin dreapta. Estimatorul inversează aritmetica livrată de `177-lane-policy-v2` (progres lateral și durată efectivă, zăvorul indicatorului și tick-ul de pornire, rezultatul eșantionului `signal-use` per oportunitate, eșantionul `pass-on-right` și rezultatul lui) plus cheile M ale rezultatului 053 din același tick. Rămâne candidat-only: nu publică profiluri, nu scrie în store, nu modifică flagurile `implemented` din catalogul 092 și nu schimbă semantica 177. Cheile estimate: `lane_change_duration` 1,9917 s (interval de inversare, ±0,05), `signal_lead_time` 1,9917 s (±0,05), `signal_use_probability` 0,3846 pe 26 de oportunități distincte (±0,0954), `pass_on_right_probability` 0,3377 între eșantioanele 0,2498 și 0,4257 (±0,0880). Fiecare cheie este validată pe episoade ținute deoparte (2+2, 3+2, 8+8, 2+2), iar cazurile neidentificabile rămân `UNOBSERVED` cu motiv explicit.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori, 0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (381 fișiere TypeScript, 6+4+3 probe negative); `npm run check:parameter-catalog` catalogul 092 sincronizat; `node --import ./scripts/register-typescript.mjs --test tests/learning/lane-v2-estimator.test.ts` 13 teste, 13 PASS, 0 fail; `npm test` 3087 teste, 3087 PASS, 0 fail; `npm run lane:learning` 24/24 verificări PASS, 4 chei candidate, 15 demonstrații neobservate, amprentă `fnv1a32:61224c01`; `npm run lane:learning -- --check` raport actual.

Fișiere și documente actualizate: `src/learning/lane-v2-estimator.ts` (nou), `src/learning/index.ts` (export la finalul listei), `tests/learning/lane-v2-estimator.test.ts`, `tests/learning/lane-v2-estimator-reference.ts`, `tests/learning/lane-v2-estimator-report.ts` (noi), `scripts/run-v2-lane-learning-report.mjs` (nou), `package.json` (`lane:learning`, ultima intrare din blocul `scripts`), `Docs/10-invatarea-stilului.md` (secțiunea contractului, la final), `Docs/Evidence/178-v2-lane-learning/` (README.md, report.json, report.md).

Limitări sau follow-up: fixturile sunt sintetice și deterministe, produse prin straturile 053/177 reale, nu calibrare pe date reale; un adaptor de telemetrie pentru faptele comenzii 177 rămâne de construit. Podeaua de 1 s a duratei face banda 0,5–1 s a catalogului neidentificabilă, iar valorile raportate sunt mijlocul intervalului de inversare, cu eroare de cel mult jumătate de tick. `pass_on_right_probability` rămâne un interval între eșantioanele acceptate și refuzate, iar un zero demonstrat ar cere un eșantion egal cu 0, pe care fluxul determinist nu îl produce. Pragurile și toleranțele sunt inițiale și trebuie revizuite pe date reale. Catalogul 092 rămâne fail-closed (`implemented: false`), iar estimatorul nu este încă montat în bucla live de simulare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '178' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: implementare finalizată pe branch-ul `loop-pbi/v2-learn-178-01`: contractul `178-lane-estimator-v2`, fixturi produse de straturile 053/177 reale, raport determinist `lane:learning` (24/24 verificări, 4 chei candidate) și dovada `Docs/Evidence/178-v2-lane-learning/`; suita completă 3087/3087 teste.
