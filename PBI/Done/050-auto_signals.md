---
id: "050"
title: "Politica la roșu și verde"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["047","036","006"]
performance_checks: ["simulation", "memory"]
parameter_role: "policy"
parameter_keys: ["red_stop_probability","green_start_delay","red_stop_line_offset","late_red_brake_threshold"]
owner: "opencode deepseek-v4.1-flash medium autonomy-policies-01"
started_at: "2026-10-19T01:27:45+03:00"
completed_at: "2026-10-19T02:17:47+03:00"
---

# 050 Politica la roșu și verde

## Obiectiv

Aplică parametrii M de conformare, întârziere, linie și frânare la roșu.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 047 trebuie să existe în Done înainte de începere.
- PBI 036 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Profilurile pot reproduce trecerea pe roșu și plecarea lentă sau rapidă.
- [x] Decizia probabilistică este eșantionată o dată pe oportunitate.

## Verificare

Testează semafor liber, coadă și oportunitate reevaluată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/autonomy/signal-policy.ts`: politica de semafor produce fapte de decizie la 10 Hz pentru semnalul autoritativ 036 al mișcării proprii — conformare probabilistică (`red_stop_probability`) eșantionată o singură dată pe oportunitatea identificată determinist din seed-urile 006 (`randomUnit`), offset la linia de oprire (`red_stop_line_offset`), întârziere de plecare la verde (`green_start_delay`) și orizont de frânare la roșu târziu (`late_red_brake_threshold`). Compoziția se face în `BehaviorFacts.stop` prin `signalBehaviorFacts`, cu precedență explicită a intenției roșii; actuația rămâne a lanțului 046–024. Exportat prin `src/autonomy/index.ts`; cele patru chei sunt marcate `implemented` în registry-ul 092.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (typecheck + lint + format:check + check:architecture + `npm test` 832 teste / 832 pass / 0 fail, din care testele PBI050 9 PASS / 0 FAIL) și `npm run check:parameter-catalog` EXIT 0. Proba locală țintită (subagent, commit `8059f60d`): cost adăugat p95 **+0,0191 ms/decizie** la 10 Hz, cinci repetări păstrate în JSON, 20 de cicluri de memorie cu contoarele existente de ownership (`getStats()`), fără agregat inventat. Re-verificarea independentă de către orchestrator a sondei de grup (`--pbi group --after`, Node 24.19.0) a reprodus aceleași valori în marjă de zgomot (after p95 0,0630 ms față de 0,0661 ms raportat). Acoperire: semafor liber → eliberare; coadă → `STOP_LINE_HOLD`; plecare lentă vs rapidă (`START_DELAY` vs `GREEN_RELEASE`); trecere pe roșu vs frânare târzie pe ambele părți ale pragului, cu oracol independent; un singur eșantion pe oportunitate (identic la 10 ferestre × 4 recitiri); compoziția reală 045 și lanțul real 219/044/045/036.

Fișiere și documente actualizate: `src/autonomy/signal-policy.ts` (nou), `src/autonomy/index.ts`, `src/profiles/parameter-registry.ts` (4 chei marcate implementate), `tests/parameters/registry.test.ts`, `tests/autonomy/signal-policy.test.ts` și `signal-policy-reference*.ts` (noi), `scripts/benchmark-autonomy-policies.mjs` (nou), `Docs/signal-policy.md` (nou), `Docs/06-autonomie-si-trafic.md`, `Docs/README.md`, `Docs/Evidence/050-signal-policy/`.

Limitări sau follow-up: identitatea oportunității este cheia dată de apelant (o cheie schimbată este o oportunitate nouă); datul liniei de oprire, observația 036 și actuația aparțin apelantului. Proba de browser vizibilă și bugetul jocului integrat rămân nevalidate, cu etichetele de calibrare provizorii; sonda CPU este diagnostică pe laptop (Ryzen 7 7735U), nu un gate hardware/FPS.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '050' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia de autonomie 044–049/052. Owner `opencode deepseek-v4.1-flash medium autonomy-policies-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat politica de semafor, testele cu oracol independent și proba de cost/memorie în worktree izolat (commit `8059f60d`, ramura `t3/autonomy-signal-stop-lane-policies`); integrată pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 832/832; catalog de parametri sincronizat) și a reprodus parțial sonda de grup; criterii bifate, dovezi completate, mutare fizică In Progress → Done.
