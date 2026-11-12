---
id: "173"
title: "Politică extinsă pentru semafoare"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","050"]
parameter_role: "policy"
parameter_keys: ["yellow_stop_probability","red_run_gap_acceptance","yellow_commit_time","green_launch_acceleration"]
owner: "loop-pbi/v2-policy-173-01"
started_at: "2026-11-12T21:46:43+02:00"
completed_at: "2026-11-12T22:01:02+02:00"
---

# 173 Politică extinsă pentru semafoare

## Obiectiv

Implementează utilizarea cheilor R: yellow_stop_probability, red_run_gap_acceptance, yellow_commit_time, green_launch_acceleration. Controlează fezabilitatea la galben, angajarea în traversare și gap-ul pe roșu.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 050 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contract nou `173-signal-policy-v2` în `src/autonomy/signal-policy-v2.ts`, ca strat peste rezultatul real `050-signal-policy-v1`. `compileSignalPolicyV2Profile` citește cele patru chei R și cele patru chei M prin `parsePublishableDrivingProfile` (intervalele și unitățile catalogului 092 rămân neschimbate), iar `evaluateSignalPolicyV2` modelează patru scenarii disjuncte: fezabilitatea la galben (`yellow_stop_probability`, eșantion unic per oportunitate și probabilitate efectivă `red_stop_probability · yellow_stop_probability`), angajarea la galben (`yellow_commit_time`, limitată de timpul rămas din fază), gap-ul pe roșu (`red_run_gap_acceptance`, cu plafonul explicit `max(cheie, 3 s)` și refuz la gap necunoscut) și plecarea la verde (`green_launch_acceleration`, plafonată la 6 m/s², după întârzierea M). Stopul lui 050 și frânarea târzie pe galben rămân dominante; stratul poate doar înăspri o trecere pe roșu, niciodată relaxa un stop.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (376 fișiere TypeScript, 6+4+3 probe negative); `npm run check:parameter-catalog` catalog sincronizat; testul țintă `tests/autonomy/signal-policy-v2.test.ts` 8/8 PASS; `npm test` 3024/3024 PASS, 0 fail (125,9 s); `npm run signal:policy` 22/22 verificări PASS (4 efecte, 12 separări, 7 verificări de siguranță, digest `fnv1a32:d42cd88e`); `npm run signal:policy -- --check` confirmă `report.json` și `report.md` actuale. Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență: `yellow_stop_probability` 0,2 → 0,158 rată vs 1 → 1,000 (+0,842); `yellow_commit_time` 0,2 s → 0 vs 6 s → 1 (angajat); `red_run_gap_acceptance` 0,1 s → acceptat vs 8 s → refuzat (gap 5 s); `green_launch_acceleration` 0,2 → 6,0 m/s² (+5,800). Compatibilitate M: 60/60 rezultate 050 identice cu cheile R neutre vs active, 60/60 acțiuni neutre identice cu 050, 30 de tick-uri active diferă cu până la 5,800 m/s².

Fișiere și documente actualizate: `src/autonomy/signal-policy-v2.ts` (nou), `src/autonomy/index.ts` (export la final), `tests/autonomy/signal-policy-v2-reference.ts`, `tests/autonomy/signal-policy-v2.test.ts`, `tests/autonomy/signal-policy-v2-report.ts` (noi), `scripts/run-v2-signal-policy-report.mjs` (nou), `package.json` (scriptul `signal:policy` la finalul blocului), `Docs/11-catalog-parametri.md` (secțiune nouă la final), `Docs/Evidence/173-v2-signal-policy/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: cheile rămân `implemented: false` în registry, deci `MANUAL_TUNING`/`LEARNED` sunt refuzate până la PBI 174 și actualizarea registrului; stratul este contract de politică, nu este încă montat în bucla live de simulare; `conflictGapS` și `phaseRemainingS` vin din observație (gap-ul necunoscut refuză trecerea, conservator); poziția în coadă nu este percepută, ca la întârzierea de la verde a lui 050; podeaua de 3 s și plafonul de 6 m/s² sunt constante de politică documentate, nu chei de catalog.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '173' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare finalizată în worktree-ul `loop-pbi/v2-policy-173-01`; contract `173-signal-policy-v2`, 8 teste țintă, 22/22 verificări ale raportului, suita completă 3024/3024 PASS. Fișier mutat fizic în Done.
