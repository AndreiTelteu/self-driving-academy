---
id: "098"
title: "Estimator STOP și acceptare de prioritate"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["093","051","052"]
parameter_role: "estimator"
parameter_keys: ["stop_full_probability","stop_dwell_time","stop_line_offset","yield_time_gap"]
owner: "Codex gpt-6-luna medium stop-lane-estimators-01"
started_at: "2026-10-19T18:17:14+03:00"
completed_at: "2026-10-19T18:41:08+03:00"
---

# 098 Estimator STOP și acceptare de prioritate

## Obiectiv

Estimează cele patru chei M STOP/yield cu contexte identificate.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 051 trebuie să existe în Done înainte de începere.
- PBI 052 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Rolling stop și oprirea provocată de trafic sunt diferențiate.
- [x] Gap-ul este prezentat ca interval sau limită când datele nu identifică un prag exact.

## Verificare

Testează STOP liber, aglomerat și oportunități acceptate/refuzate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `estimateStopYieldParameters` în `src/learning/stop-yield-estimator.ts`, exportat prin `src/learning/index.ts`, estimează cele patru chei STOP/yield. Oprirea provocată de trafic (lider, coadă, context blocat) este exclusă din denominatorul de conformare la linia de oprire și contorizată separat; un rolling stop este o consecință proprie și este respins dacă ar contrazice rezultatul cert 086 (`CROSSED_WITHOUT_STOP`). `stop_full_probability` folosește subsetul cert eligibil pentru learning, verifică acoperirea exactă față de denominatorul 086 și refuză denominatorul zero cu motiv explicit. `stop_dwell_time` folosește durata măsurată în tick-uri, iar `stop_line_offset` faptele de apropiere eligibile. `yield_time_gap` raportează o limită inferioară când există doar oportunități acceptate (`PROCEEDED`) și un interval `[cel mai mare refuzat, cel mai mic acceptat]` când există și refuzuri (`YIELDED`), fără să inventeze un prag punctual.

Verificări executate și rezultat:
- Implementator: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1047/1047 PASS la vârful grupului.
- Orchestrator, pe starea integrată după 098 (`b67588e1`): `npm run check` EXIT 0 — 1045 teste, 1045 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0.
- Testele 098 acoperă STOP liber vs oprire provocată de trafic, rolling stop separat, refuzul denominatorului zero, limita inferioară la doar acceptări și intervalul la acceptări plus refuzuri.
- Dovezi: [Evidence/098-stop-yield-estimator](../../Docs/Evidence/098-stop-yield-estimator/README.md).

Fișiere și documente actualizate: `src/learning/stop-yield-estimator.ts` (nou), `src/learning/index.ts`, `tests/learning/stop-yield-estimator.test.ts` (nou), [Docs/stop-yield-estimator.md](../../Docs/stop-yield-estimator.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/098-stop-yield-estimator/`.

Limitări sau follow-up: Clasificarea „provocat de trafic”, rolling stop-ul, dwell-ul și offsetul sunt fapte furnizate de apelant din 085–087; estimatorul verifică identitatea, fereastra și consistența cu 086, dar nu le derivează singur. Intervalul de yield este o limită observată, nu un prag statistic. Candidat-only, necablat în bucla live, fără publicare de profil și fără probe browser/GPU/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '098' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `b67588e1`): conformare pe subsetul cert 086 cu excluderea opririlor provocate de trafic, rolling stop separat, yield ca limită inferioară sau interval. Integrat prin fast-forward; verificat de orchestrator cu 1045/1045 teste.
