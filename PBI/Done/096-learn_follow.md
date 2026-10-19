---
id: "096"
title: "Estimator headway gap și răspuns la lider"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["093","048"]
parameter_role: "estimator"
parameter_keys: ["following_time_headway","following_min_gap","queue_standstill_gap","following_speed_gain"]
owner: "Codex gpt-6-luna medium follow-signal-estimators-01"
started_at: "2026-10-19T17:35:30+03:00"
completed_at: "2026-10-19T18:01:29+03:00"
---

# 096 Estimator headway gap și răspuns la lider

## Obiectiv

Separă headway, minimum gap, queue gap și speed gain cu contexte variate.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 093 trebuie să existe în Done înainte de începere.
- PBI 048 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Datele la o singură viteză nu pretind identificarea tuturor coeficienților.
- [x] Coada oprită și urmărirea în mers au contexte separate.

## Verificare

Testează viteze variate, viteză unică și schimbare de lider.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `estimateFollowingParameters` în `src/learning/following-estimator.ts`, exportat prin `src/learning/index.ts`, estimează cele patru chei de urmărire. Pentru `following_time_headway` și `following_min_gap` potrivește documentata relație `gap = minimumGap + timeHeadway × speed` prin cele mai mici pătrate doar pe episoade LEADER în mers, cu identitate 086/087/088 verificată (oportunitate, fereastră, segment, vehicul, incarnation, mod LEARNING, fereastră eligibilă și prefix utilizabil) și deduplicare pe `opportunity.id + occurrence + leaderId`. La o singură viteză, panta și interceptul sunt degenerate: ambele chei întorc `UNIDENTIFIED` cu valoare null și motiv `WEAK_IDENTIFICATION_SPEED_VARIATION_REQUIRED`, fără să inventeze o pereche. `queue_standstill_gap` folosește exclusiv episoade de coadă oprită (viteze ≤ 0,1 m/s) și nu se amestecă cu urmărirea în mers; `following_speed_gain` folosește doar observațiile explicite de câștig de viteză. Rezultatul raportează RMS-ul reziduurilor, numărul de episoade, breakdown-ul de context și un contor de schimbări de lider; este candidat-only, nu produce profil și nu activează `estimable`.

Verificări executate și rezultat:
- Implementator: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1043/1043 PASS la vârful grupului.
- Orchestrator, pe starea integrată după 096 (`21fa0075`): `npm run check` EXIT 0 — 1040 teste, 1040 pass, 0 fail.
- Testele 096 (3/3): fixture-ul cu viteze variate recuperează minimum gap 1 m și headway 1,5 s cu RMS 0; o singură viteză produce `UNIDENTIFIED` pentru ambii coeficienți; coada oprită și urmărirea în mers nu se contaminează; o schimbare de lider separă episoadele; un mod străin este exclus.
- Dovezi: [Evidence/096-following-estimator](../../Docs/Evidence/096-following-estimator/README.md).

Fișiere și documente actualizate: `src/learning/following-estimator.ts` (nou), `src/learning/index.ts`, `tests/learning/following-estimator.test.ts` (nou), [Docs/following-estimator.md](../../Docs/following-estimator.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/096-following-estimator/`.

Limitări sau follow-up: Fit-ul este algebric, nu statistic: cu două viteze distincte și RMS 0 calitatea raportată este HIGH deși identificarea este fragilă; pragul Docs/10 de trei episoade este respectat, dar nu impune trei benzi de viteză distincte. `following_speed_gain` este media unor valori furnizate de apelant, nu o derivare din 085. Candidat-only, necablat în bucla live, fără publicare de profil și fără probe browser/GPU/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '096' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Implementare în worktree izolat (commit `21fa0075`): fit gap = minimumGap + headway × speed doar pe LEADER în mers, `UNIDENTIFIED` la o singură viteză, coadă oprită separată, dedup pe oportunitate și lider. Integrat prin fast-forward; verificat de orchestrator cu 1040/1040 teste.
