---
id: "143"
title: "Comparație A B cu distribuții și dovezi"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["142","138","139","082"]
owner: "loop-pbi/compare-143-01"
started_at: "2026-11-11T22:42:02+02:00"
completed_at: "2026-11-11T23:04:48+02:00"
---

# 143 Comparație A B cu distribuții și dovezi

## Obiectiv

Afișează diferențe, expunere, număr de seed-uri și incertitudine.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 142 trebuie să existe în Done înainte de începere.
- PBI 138 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.
- PBI 082 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Rezultatul nu atribuie toate diferențele unui singur parametru.
- [x] Scenariile izolate pot verifica un parametru la un moment dat.

## Verificare

Compară profil identic, schimbare izolată și stil complex.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

Suita de referință din `tests/experiments/experiment-compare-fixture.ts` acoperă exact cele trei cazuri cerute: `identical-pair` (profil identic, 0 diferențe), `isolated-red-stop-probability` și `isolated-red-stop-line-offset` (o singură cheie schimbată) și `complex-seed-*` (PRUDENT/IMPULSIVE, șapte chei diferite) pe trei seed-uri. Rezultatul agregat: 43 de diferențe, 37 de prag și 6 de geometrie, 4 parametri, 0 neatribuite, 3 oportunități cu două cauze.

## Dovezi de finalizare

Rezultat implementare: `143-experiment-compare-v1` este un read model peste rezultatele 142 încheiate: copiază divergențele, cauzele, parametrii și `profileDifferences` raportate de 142 și declară `sources.policiesEvaluated: 0`. Afișează distribuția cauzelor (37 de prag, 6 de geometrie), a parametrilor (20/17/4/2, cel mai frecvent 46,5%), a categoriilor (Semafoare 22, STOP 21) și cazurile neatribuite (0); expunerea (144 de oportunități evaluate, 288 de evaluări, 96 vizibile, 192 invizibile, fereastra tick 61–84); numărul de seed-uri (3 de bază, 3 de scenariu, 72 de oportunitate) cu diferențele pe seed 20/13/10 și incertitudinea declarată (`MULTI_SEED_SAMPLE`, `generalizable: false`); scenariile izolate (10 diferențe numai pentru `red_stop_probability`, 2 numai pentru `red_stop_line_offset`); coexistența a două cauze pe aceeași oportunitate (3 din 20, de exemplu `opportunity-15`: prag în cohorta de probabilitate, geometrie în cohorta de offset); perechile 138/139 (0 → 50 și 1,2 → 2,1). Panoul `143-experiment-compare-panel-v1` afișează tabele și bare deterministe cu buton nativ, focus mutat și readus, Tab, Escape și zero listeners globali.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 erori, 0 warnings); `npm run format:check` PASS; `npm run check:architecture` PASS (351 fișiere, sonde negative PASS); `npm run check:parameter-catalog` PASS; `npm test` PASS (2554 teste, 2554 trecute, 0 eșuate); testele țintă `tests/experiments/experiment-compare.test.ts` 14/14 și `tests/ui/experiment-compare.test.ts` 15/15; `npm run experiment:compare` 49/49 verificări, 5 probe de refuz, PASS; `--check` PASS („report is current”). Rezumatul scriptului: `checks 49/49, refusals 5, cohorts 6, decisions 144, divergent 43, causes 37/6, parameters 4, visible 96, invisible 192, seeds 3, coexisting 3`.

Fișiere și documente actualizate: `src/experiments/experiment-compare.ts`, `src/experiments/index.ts`, `src/ui/experiment-compare-format.ts`, `src/ui/experiment-compare-panel.ts`, `src/ui/index.ts`, `tests/experiments/experiment-compare-fixture.ts`, `tests/experiments/experiment-compare.test.ts`, `tests/experiments/experiment-compare-report.ts`, `tests/ui/experiment-compare.test.ts`, `scripts/run-experiment-compare-report.mjs`, `package.json` (script `experiment:compare`, ultima intrare), `Docs/14-experimente-si-indicatori.md` (secțiune nouă la final), `Docs/08-interfata-camera-si-control.md` (secțiune nouă la final), `Docs/Evidence/143-experiment-compare/{README.md,report.json,report.md}`.

Limitări sau follow-up: vizibilitatea este un fapt declarat de apelant (camera reală sau fixture controlat), nu o rază trasată de modul; agregatele 138/139 din fixture sunt construite prin API-ul real, dar sunt fixture-uri controlate, nu o măsurare a rerulării; eșantionul are 3 seed-uri și un singur scenariu, deci numerele sunt exacte pentru aceste rulări și nu sunt o rată pentru populație (nu se raportează interval de încredere); panoul nu a fost verificat într-un browser real, ci pe DOM-ul determinist al proiectului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '143' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11 22:42: preluat de `loop-pbi/compare-143-01`, mutat în In Progress.
- 2026-11-11 23:04: implementat contractul `143-experiment-compare-v1` și panoul; 49/49 verificări de raport, 14 + 15 teste țintă, suita completă 2554/2554; mutat în Done.
