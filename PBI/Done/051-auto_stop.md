---
id: "051"
title: "Politica STOP și opriri incomplete"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["047","037","006"]
performance_checks: ["simulation", "memory"]
parameter_role: "policy"
parameter_keys: ["stop_full_probability","stop_dwell_time","stop_line_offset"]
owner: "opencode deepseek-v4.1-flash medium autonomy-policies-01"
started_at: "2026-10-19T01:27:45+03:00"
completed_at: "2026-10-19T02:17:47+03:00"
---

# 051 Politica STOP și opriri incomplete

## Obiectiv

Aplică probabilitatea opririi complete, durata și offsetul STOP.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 047 trebuie să existe în Done înainte de începere.
- PBI 037 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Profilurile prudente și cele cu rolling stop au rezultate distincte.
- [x] O oprire provocată de lider nu este confundată cu intenția STOP.

## Verificare

Rulează STOP liber și STOP cu coadă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/autonomy/stop-policy.ts`: politica citește observația autoritativă 037 a oportunității STOP și decide probabilitatea opririi complete (`stop_full_probability`), durata (`stop_dwell_time`) și offsetul (`stop_line_offset`), cu un singur eșantion pe oportunitate. Calea de dovezi rămâne separată: o oprire provocată de lider nu devine niciodată intenția STOP a șoferului (`leaderInduced`), iar profilurile prudente și cele cu rolling stop au rezultate distincte (`FULL` + `stopRequested` vs `ROLLING` + `ROLL_THROUGH`). Compoziția se face în `BehaviorFacts.stop` prin `stopBehaviorFacts`, păstrând independentă intenția roșie a politicii 050. Exportat prin `src/autonomy/index.ts`; cele trei chei sunt marcate `implemented` în registry-ul 092.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (typecheck + lint + format:check + check:architecture + `npm test` 832 teste / 832 pass / 0 fail, din care testele PBI051 6 PASS / 0 FAIL) și `npm run check:parameter-catalog` EXIT 0. Proba locală țintită (subagent, commit `8059f60d`): cost adăugat p95 **+0,0141 ms/decizie** la 10 Hz, cinci repetări păstrate, 20 de cicluri de memorie cu contoarele existente de ownership. Re-verificarea independentă a sondei de grup de către orchestrator a reprodus aceleași valori în marjă de zgomot. Acoperire: STOP liber `APPROACH → HOLD → DWELL → RELEASE` cu limită inclusivă; prudent vs rolling cu un singur eșantion pe oportunitate; STOP cu coadă care nu se confundă cu intenția STOP; traversare; precedență roșie; rulare nativă reală 037 cu `STOP_APPROACH` / `FULL_STOP` / `STOP_LINE_CROSSED` și eliberare doar după durata dovedită (o cerință de 4 s nu se eliberează).

Fișiere și documente actualizate: `src/autonomy/stop-policy.ts` (nou), `src/autonomy/index.ts`, `src/profiles/parameter-registry.ts` (3 chei marcate implementate), `tests/parameters/registry.test.ts`, `tests/autonomy/stop-policy.test.ts` și `stop-policy-reference.ts` (noi), `scripts/benchmark-autonomy-policies.mjs` (nou), `Docs/stop-policy.md` (nou), `Docs/06-autonomie-si-trafic.md`, `Docs/README.md`, `Docs/Evidence/051-stop-policy/`.

Limitări sau follow-up: durata staționară curentă a oportunității este readback-ul autoritativ al apelantului asupra fluxului 037, care trebuie configurat cu o fereastră minimă de dovadă pentru ca `stop_dwell_time` să rămână rezolvabil. Proba de browser vizibilă și gate-urile integrate rămân nevalidate; sonda CPU este diagnostică pe laptop, nu un gate hardware/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '051' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia de autonomie 044–049/052. Owner `opencode deepseek-v4.1-flash medium autonomy-policies-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat politica STOP, testele cu oracol independent, rularea nativă reală 037 și proba de cost/memorie în worktree izolat (commit `8059f60d`); integrată pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 832/832; catalog de parametri sincronizat); criterii bifate, dovezi completate, mutare fizică In Progress → Done.
