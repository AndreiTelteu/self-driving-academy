---
id: "171"
title: "Politică extinsă pentru urmărire și distanțe"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","048"]
parameter_role: "policy"
parameter_keys: ["cutin_brake_response","closing_ttc_threshold","leader_change_delay","following_hysteresis"]
owner: "loop-pbi/v2-policy-171-01"
started_at: "2026-11-12T20:38:41+02:00"
completed_at: "2026-11-12T21:18:00+02:00"
---

# 171 Politică extinsă pentru urmărire și distanțe

## Obiectiv

Implementează utilizarea cheilor R: cutin_brake_response, closing_ttc_threshold, leader_change_delay, following_hysteresis. Testează cut-in, schimbarea liderului, TTC și histerezis în episoade distincte.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 048 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contract `171-follow-policy-v1` în `src/autonomy/follow-policy.ts`, strat de politică peste rezultatul real 048. Cele patru chei R acționează în episoade disjuncte: cut-in (18 m, ego 15 m/s), timp până la contact (apropiere 6 m/s la 36 m), schimbarea liderului (lider nou la 60 m, fără cut-in) și histerezis (decalaj oscilând ±2 m în jurul decalajului dorit). Fiecare cheie schimbă observabil ținta commitată în episodul ei și este inertă în celelalte trei: 12 perechi de separare cu diferența 0,000 m/s. Plafonul de contact, oprirea cerută și podeaua de 5 m sunt aplicate după deciziile de stil, iar întârzierea de lider nu amână niciodată o reducere.

Verificări executate și rezultat:
- `npm run typecheck` — 0 erori.
- `npm run lint` — 0 erori, 0 warnings.
- `npm run format:check` — toate fișierele formatate.
- `npm run check:architecture` — PASS (374 fișiere TypeScript, 6+4+3 probe negative).
- `npm run check:parameter-catalog` — catalogul 092 sincronizat, neschimbat.
- `node --import ./scripts/register-typescript.mjs --test tests/autonomy/follow-policy.test.ts` — 10 teste, 10 PASS, 0 fail.
- `npm test` — 3003 teste, 3003 PASS, 0 fail (88,1 s).
- `npm run follow:policy` — 20/20 verificări PASS (4 efecte, 12 separări, 6 siguranță, amprentă `fnv1a32:d746186b`).
- `npm run follow:policy -- --check` — `report.json` și `report.md` actuale.
- Compatibilitate M pe stratul 048 real: 60/60 rezultate 048 identice cu cheile R neutre vs active; 60/60 tick-uri neutre forwardează exact ținta 048; 40 tick-uri active diferă doar în ținta 171, cu până la 4,200 m/s.
- Tabelul cheie → episod → valoare joasă → valoare ridicată → diferență: `cutin_brake_response` 0,2 → 9,940 m/s vs 1 → 1,700 m/s; `closing_ttc_threshold` 0,3 → 15,260 m/s vs 8 → 11,875 m/s; `leader_change_delay` 0 → tick 1 vs 2 → tick 121; `following_hysteresis` 0 → variație 30,800 m/s vs 5 → variație 0,000 m/s.

Fișiere și documente actualizate:
- `src/autonomy/follow-policy.ts` (nou), `src/autonomy/index.ts` (export la final).
- `tests/autonomy/follow-policy-reference.ts`, `tests/autonomy/follow-policy.test.ts`, `tests/autonomy/follow-policy-report.ts` (noi).
- `scripts/run-v2-follow-policy-report.mjs` (nou), `package.json` (`follow:policy`, ultima intrare).
- `Docs/11-catalog-parametri.md` (secțiune nouă la final).
- `Docs/Evidence/171-v2-follow-policy/` (`README.md`, `report.json`, `report.md`).

Limitări sau follow-up:
- Registry-ul 092 rămâne fail-closed (`implemented: false`), deci `MANUAL_TUNING`/`LEARNED` sunt refuzate pentru cele patru chei; stratul consumă valori `BASE`/`IMPORTED` validate.
- Contractul de politică nu este încă montat în bucla live de simulare; integrarea în compoziție și proba de browser rămân pași separați, ca la 046/047/048/167/169.
- Cut-in-ul și identitatea liderului vin din observație; stratul nu face percepție, iar observația trebuie să descrie același lider și decalaj ca rezultatul 048.
- Configurația neutră este cea mai permisivă valoare admisă (prag 0,3 s), nu o identitate absolută: plafonul de contact rămâne finit, dar nu se activează în scena de integrare.
- Histerezisul poate ține angajamentul anterior peste preferința 048 cu cel mult banda de toleranță (maximum 5 m), mărginită de plafonul de contact și de podeaua de 5 m.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '171' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: preluat pe branch-ul `loop-pbi/v2-policy-171-01`, mutat în In Progress.
- 2026-11-12: implementat contractul `171-follow-policy-v1` și raportul determinist; 10/10 teste țintă, 3003/3003 teste, 20/20 verificări de raport. Mutat în Done.
