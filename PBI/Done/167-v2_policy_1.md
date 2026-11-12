---
id: "167"
title: "Politică extinsă pentru viteză și ritm"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","046"]
parameter_role: "policy"
parameter_keys: ["speed_delta_arterial","cruise_speed_variability","overtake_speed_bonus","cruise_accel_deadband"]
owner: "loop-pbi/v2-policy-167-01"
started_at: "2026-11-12T18:46:15+02:00"
completed_at: "2026-11-12T19:07:00+02:00"
---

# 167 Politică extinsă pentru viteză și ritm

## Obiectiv

Implementează utilizarea cheilor R: speed_delta_arterial, cruise_speed_variability, overtake_speed_bonus, cruise_accel_deadband. Separă variația ritmului, deadbandul și bonusul de depășire de constrângerile traficului.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 046 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `167-speed-policy-v1` din `src/autonomy/speed-policy.ts` activează cele patru chei R de tempo peste 046/047/048: `speed_delta_arterial` (delta de stil doar pe drum arterial, cu `postedDeviationMps`), `cruise_speed_variability` (undă deterministă de amplitudine ±valoare, fază din seed și actor, perioadă 600 tick-uri), `overtake_speed_bonus` (aplicat doar în depășire) și `cruise_accel_deadband` (țintă ținută în bandă și cerere `HOLD` sub bandă). Variația și bonusul sunt limitate de bugetul de stil (`min(max(țintăDeStil, limităPostată), 30)`), iar anvelopa dură (semafor 0, curbă/apropiere 046, trafic `leadSpeed + (gap − 5 m) / 2 s`, 0 m/s sub 5 m) se aplică după chei, deci o valoare mare nu produce condus nesigur.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` PASS; `npm run check:architecture` PASS (370 fișiere); `npm run check:parameter-catalog` sincronizat; testele țintă 9/9 PASS; `npm test` 2965/2965 PASS (100,0 s); `npm run speed:policy` 16/16 verificări PASS (digest `fnv1a32:6a605666`); `npm run speed:policy -- --check` raport actual. Tabelul cheie → scenariu → valoare joasă → ridicată → diferență: arterial −10 → 3,90 m/s vs 20 → 30,00 m/s (Δ 26,10); variabilitate 0,3 → amplitudine 0,57 vs 3 → 5,94 (Δ 5,38, 22 vs 199 schimbări); bonus 0 → 10,90 vs 2 → 12,90 (Δ 2,00, bonus 10 saturează la 13,90); deadband 0,05 → 10,90/`ACCELERATE` vs 2 → 10,50/`HOLD`. Compatibilitate M: ținta 046 este 10 m/s cu cheile 167 neutre și 10 m/s cu ele active, unități neschimbate.

Fișiere și documente actualizate: `src/autonomy/speed-policy.ts` (nou), `src/autonomy/index.ts` (export la final), `tests/autonomy/speed-policy.test.ts`, `tests/autonomy/speed-policy-reference.ts`, `tests/autonomy/speed-policy-report.ts` (nou), `scripts/run-v2-speed-policy-report.mjs` (nou), `package.json` (scriptul `speed:policy`, ultima intrare), `Docs/11-catalog-parametri.md` (secțiune nouă la final), `Docs/Evidence/167-v2-speed-policy/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: registry-ul 092 păstrează `implemented: false` pentru cele patru chei, deci `MANUAL_TUNING`/`LEARNED` rămân refuzate până la 168 și actualizarea registrului; valorile se consumă din `BASE`/`IMPORTED`. Ca și 046/047/048, stratul nu este încă montat în bucla live de simulare. Drumul arterial nu are fapte 046, deci acolo apelantul nu trimite țintă 046.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '167' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare finalizată în `loop-pbi/v2-policy-167-01`; contract `167-speed-policy-v1`, teste 9/9, raport 16/16, suita completă 2965/2965; fișier mutat fizic în Done.
