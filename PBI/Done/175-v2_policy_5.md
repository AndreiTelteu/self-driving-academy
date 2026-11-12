---
id: "175"
title: "Politică extinsă pentru stop și prioritate"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","051"]
parameter_role: "policy"
parameter_keys: ["rolling_stop_speed","priority_assertiveness","allway_stop_patience","blocked_intersection_entry_probability"]
owner: "loop-pbi/v2-policy-175-01"
started_at: "2026-11-12T22:46:19+02:00"
completed_at: "2026-11-12T23:03:34+02:00"
---

# 175 Politică extinsă pentru stop și prioritate

## Obiectiv

Implementează utilizarea cheilor R: rolling_stop_speed, priority_assertiveness, allway_stop_patience, blocked_intersection_entry_probability. Separă rolling stop, asertivitatea, răbdarea și intrarea într-o intersecție blocată.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 051 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `175-stop-priority-policy-v1` din `src/autonomy/stop-priority-policy.ts` este un strat pur peste rezultatele reale 051 și 052. Cele patru chei R au scenarii disjuncte: `rolling_stop_speed` comandă viteza prin rolling stop cu plafon 2,5 m/s; `priority_assertiveness` revendică o oportunitate refuzată de 052 coborând cerința de la `yield_time_gap` spre podeaua de 3 s; `allway_stop_patience` ține eliberarea 051 doar pentru un sosit care nu este primul; `blocked_intersection_entry_probability` intră doar când spațiul de ieșire nu este declarat, cu eșantion unic per oportunitate și plafon 0,5. Veto-ul intersecției blocate și spațiul de ieșire insuficient sunt absolute și precedă orice cheie. Export adăugat la finalul `src/autonomy/index.ts`.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (378 fișiere TS, probe negative); `npm run check:parameter-catalog` sincronizat; testele țintă 9/9 PASS; `npm test` 3047 teste, 3047 PASS, 0 fail (99,9 s); `npm run stop:policy` 22/22 verificări PASS; `npm run stop:policy -- --check` raport actual. Tabelul cheie → scenariu → joasă → ridicată → diferență: rolling stop 0,2 → 5 m/s dă 0,200 → 2,500 m/s (+2,300); asertivitate 0 → 1 dă refuz → revendicare (+1,000); răbdare 0 → 10 s dă eliberare → ținere (−1,000); intrare blocată 0 → 1 dă așteptare → intrare (+1,000). Compatibilitate M: 60/60 rezultate 051 și 60/60 rezultate 052 identice între cheile R neutre și active, 60/60 acțiuni neutre identice cu 051/052, 18 tick-uri active diferă (până la 1,500 m/s).

Fișiere și documente actualizate: `src/autonomy/stop-priority-policy.ts`, `src/autonomy/index.ts`, `tests/autonomy/stop-priority-policy-reference.ts`, `tests/autonomy/stop-priority-policy.test.ts`, `tests/autonomy/stop-priority-policy-report.ts`, `scripts/run-v2-stop-policy-report.mjs`, `package.json`, `Docs/11-catalog-parametri.md`, `Docs/Evidence/175-v2-stop-policy/README.md` (cu `report.json` și `report.md`).

Limitări sau follow-up: Registry-ul 092 rămâne fail-closed pentru cele patru chei (`implemented: false`), deci MANUAL_TUNING/LEARNED rămân refuzate; montarea în bucla live și proba de browser sunt pași separați; observația (poziția all-way, secundele de la oprire, spațiul de ieșire, blocarea) este a apelantului, fără percepție; plafoanele 2,5 m/s, 3 s, 5 m și 0,5 sunt constante de politică documentate, nu chei de catalog; nivelul de validare este „funcțional izolat”, fără pretenții de performanță hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '175' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare finalizată în worktree-ul `loop-pbi/v2-policy-175-01`; contract `175-stop-priority-policy-v1`, 22/22 verificări ale raportului, 3047 teste PASS; mutat fizic în Done.
