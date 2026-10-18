---
id: "053"
title: "Schimbări de bandă și depășire V1"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["048","049","044"]
performance_checks: ["simulation", "memory"]
parameter_role: "policy"
parameter_keys: ["lane_change_front_gap","lane_change_back_gap","lane_change_speed_gain","lane_change_cooldown"]
owner: "opencode deepseek-v4.1-flash medium autonomy-policies-01"
started_at: "2026-10-19T01:27:45+03:00"
completed_at: "2026-10-19T02:17:47+03:00"
---

# 053 Schimbări de bandă și depășire V1

## Obiectiv

Aplică gap față/spate, avantaj de viteză și cooldown.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 048 trebuie să existe în Done înainte de începere.
- PBI 049 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Schimbarea opțională ține cont de profil și context.
- [x] Manevra începută are continuitate și nu este resetată în fiecare frame.

## Verificare

Testează gap insuficient, avantaj absent și două schimbări apropiate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/autonomy/lane-change-policy.ts`: schimbarea opțională de bandă este porționată prin gap față/spate (`lane_change_front_gap`, `lane_change_back_gap`), avantaj de viteză (`lane_change_speed_gain`) și cooldown (`lane_change_cooldown`), pe o proiecție explicită de vecinătate laterală 033 (inclusiv clasa de acces), fără a inventa o muchie laterală. Manevra începută este ținută într-un latch deținut de apelant și transmis înainte/înapoi, deci are continuitate și nu este re-validată sau resetată în fiecare cadru. Compoziția se face în `BehaviorFacts.laneChange`; exportat prin `src/autonomy/index.ts`, iar cele patru chei sunt marcate `implemented` în registry-ul 092.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (typecheck + lint + format:check + check:architecture + `npm test` 832 teste / 832 pass / 0 fail, din care testele PBI053 12 PASS / 0 FAIL) și `npm run check:parameter-catalog` EXIT 0. Proba locală țintită (subagent, commit `8059f60d`): cost adăugat p95 **+0,0121 ms/decizie** (grup 050–053: +0,0180 ms), cinci repetări păstrate, 20 de cicluri de memorie cu contoarele existente de ownership. Re-verificarea independentă de către orchestrator a sondei de grup (`--pbi group --after`) a reprodus aceleași valori în marjă de zgomot (base p95 0,0476 ms / after p95 0,0630 ms față de 0,0481/0,0661 raportat). Acoperire: gap insuficient și avantaj absent rămân în bandă (`INSUFFICIENT_FRONT_GAP`, `INSUFFICIENT_BACK_GAP`, `INSUFFICIENT_SPEED_GAIN`), două schimbări apropiate blocate de cooldown inclusiv (959 → `COOLDOWN_ACTIVE`, 960 → `CHANGE`), continuitate pe cinci decizii consecutive fără reset (`CHANGE`/`COMMITTED_CONTINUITY` cu target și tick de start identice) și eliberare explicită când ținta nu mai este vecină 033, semantica de acces 033, compoziția reală 045 și lanțurile reale 219/033/046 și 219/044/045/036.

Fișiere și documente actualizate: `src/autonomy/lane-change-policy.ts` (nou), `src/autonomy/index.ts`, `src/profiles/parameter-registry.ts` (4 chei marcate implementate), `tests/parameters/registry.test.ts`, `tests/autonomy/lane-change-policy*.ts`, `policy-probe-fixture.ts` și `policy-decision-path.test.ts` (noi), `scripts/benchmark-autonomy-policies.mjs` (nou), `Docs/lane-change-policy.md` (nou), `Docs/06-autonomie-si-trafic.md`, `Docs/README.md`, `Docs/Evidence/053-lane-change/`, `Docs/Evidence/autonomy-policies-group/`.

Limitări sau follow-up: vecinătatea laterală este proiecția explicită a apelantului din graful 033, iar latch-ul și finalizarea manevrei sunt decizii explicite ale apelantului; manevra nu este impusă de rută. Proba de browser vizibilă rămâne neexecutată și consemnată ca atare (vezi `Docs/Evidence/autonomy-policies-group/README.md`); sonda CPU este diagnostică pe laptop, nu un gate hardware/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '053' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia de autonomie 044–049/052. Owner `opencode deepseek-v4.1-flash medium autonomy-policies-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat politica de schimbare de bandă cu latch de continuitate, testele cu oracol independent, testul de integrare pe cadența reală 219 și proba de cost/memorie în worktree izolat (commit `8059f60d`); integrată pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 832/832; catalog de parametri sincronizat) și a reprodus sonda de grup `--pbi group --after`; criterii bifate, dovezi completate, mutare fizică In Progress → Done.
