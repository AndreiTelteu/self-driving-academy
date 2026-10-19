---
id: "094"
title: "Estimator viteză curbe și apropiere"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["093","046"]
parameter_role: "estimator"
parameter_keys: ["speed_delta_urban","speed_delta_residential","curve_lateral_accel","intersection_approach_speed"]
owner: "Codex gpt-6-luna medium speed-accel-estimators-01"
started_at: "2026-10-19T16:53:02+03:00"
completed_at: "2026-10-19T17:16:17+03:00"
---

# 094 Estimator viteză curbe și apropiere

## Obiectiv

Estimează cele patru chei M de viteză din ferestre eligibile.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 046 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Traficul constrâns nu este folosit ca viteză preferată.
- [x] Profiluri sintetice distincte produc diferențe comportamentale pe date independente.

## Verificare

Validează trafic liber, curbă și segment cu lider.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `estimateSpeedParameters` în `src/learning/speed-estimator.ts`, exportat prin `src/learning/index.ts`, produce candidați pentru cele patru chei M de viteză (`speed_delta_urban`, `speed_delta_residential`, `curve_lateral_accel`, `intersection_approach_speed`) din fereastra 088 utilizabilă și eșantioane de viteză cu tick exact. Sunt acceptate numai ferestre `FREE_TRAFFIC`/`ELIGIBLE`/`LEARNING` cu identitate 087/088 potrivită; `LEADER`, `BLOCKED_GREEN`, `MECHANICAL_LIMIT`, `IMPACT`, `PAUSE`/`FOCUS_LOST`, `MANUAL`/`AUTO` și ferestrele complet suprimate nu devin viteză preferată. Curbura folosește exclusiv cererea 089 `INTENTIONAL` (nu o limită inferioară `CAPABILITY_LIMITED`), iar delta față de limita postată este mediana eșantioanelor, limitată la intervalul cheii din 092. Rezultatul este doar candidat, cu calitate, încredere, număr de episoade și context; nu produce profil, nu setează valoare/delta în ledger și nu activează `estimable`.

Verificări executate și rezultat:
- Implementator: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1037/1037 PASS la vârful grupului (094+095).
- Orchestrator, pe starea integrată după 094 (`02f535e3`): `npm run check` EXIT 0 — 1034 teste, 1034 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0.
- Testele 094 (2/2): stil prudent vs riscant produc candidați −1 și +5 m/s; proiecția documentată 046 pentru trafic liber (limită postată 15 + delta, plafon 30) diferă cu 6 m/s pe date ținute separat; fereastra LEADER și cea `FULLY_SUPPRESSED` nu produc candidat, iar o cheie din afara celor 24 este refuzată.
- Dovezi: [Evidence/094-speed-estimator](../../Docs/Evidence/094-speed-estimator/README.md).

Fișiere și documente actualizate: `src/learning/speed-estimator.ts` (nou), `src/learning/index.ts`, `tests/learning/speed-estimator.test.ts` (nou), [Docs/speed-estimator.md](../../Docs/speed-estimator.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/094-speed-estimator/`.

Limitări sau follow-up: Diferența comportamentală este verificată prin formula 046 de trafic liber saturat (aceeași formulă verificată de suita 046), nu printr-o rulare integrată de condus; nu există probe browser, GPU sau FPS. Estimatorul nu este cablat în bucla live și nu publică profiluri. `curve_lateral_accel` raportează accelerația laterală în m/s² din cererea normalizată înmulțită cu plafonul clasei, deci valoarea absolută rămâne dependentă de clasă; comparabilitatea între clase este responsabilitatea 089, nu a estimatorului. Calitatea este un raport simplu eșantioane/episoade, nu o incertitudine statistică.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '094' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `02f535e3`): estimator candidat pentru cele patru chei de viteză, trafic constrâns exclus, curbă doar din cerere 089 intenționată, proiecție 046 prudent/riscant diferită cu 6 m/s. Integrat prin fast-forward; verificat de orchestrator cu 1034/1034 teste.
