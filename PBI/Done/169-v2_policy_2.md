---
id: "169"
title: "Politică extinsă pentru accelerație și frânare"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","047"]
parameter_role: "policy"
parameter_keys: ["braking_jerk","throttle_release_delay","launch_intensity","coasting_bias"]
owner: "loop-pbi/v2-policy-169-01"
started_at: "2026-11-12T19:43:44+02:00"
completed_at: "2026-11-12T19:58:12+02:00"
---

# 169 Politică extinsă pentru accelerație și frânare

## Obiectiv

Implementează utilizarea cheilor R: braking_jerk, throttle_release_delay, launch_intensity, coasting_bias. Separă coastingul, jerk-ul de frână, întârzierea ridicării accelerației și plecarea specifică.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 047 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `169-accel-policy-v1` din `src/autonomy/accel-policy.ts` activează cele patru chei R longitudinale peste rezultatul 047, pe canale disjuncte: `braking_jerk` (rampa decelerației, plafonată la cererea 047), `throttle_release_delay` (ținerea throttle-ului la ridicare, anulată de orice cerere de frânare), `launch_intensity` (fracțiunea din cererea 047 sub 2 m/s, între 0,35 și 1,0) și `coasting_bias` (eliberarea unei cereri mici sub 0,6 m/s² peste 2 m/s). Oprirea cerută și liderul sub 5 m anulează throttle-ul, plecarea și ținerea; frânarea nu este amânată. Starea de actuare este a apelantului și se returnează în `actuation`.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` PASS; `npm run check:architecture` PASS (372 fișiere); `npm run check:parameter-catalog` sincronizat; testele țintă 10/10 PASS; `npm test` 2983/2983 PASS (92,5 s); `npm run accel:policy` 19/19 verificări PASS (digest `fnv1a32:912eb553`); `npm run accel:policy -- --check` raport actual. Tabelul cheie → scenariu → joasă → ridicată → diferență: braking_jerk 0,2 → 0,027 m/s² vs 20 → 2,000 m/s² după 8 tick-uri (Δ 1,973); throttle_release_delay 0 → throttle 0,000 vs 3 → 0,400, ținut 0 vs 180 tick-uri (Δ 0,400); launch_intensity 0 → 0,525 vs 1 → 1,500 m/s² (Δ 0,975); coasting_bias 0 → 0,400 vs 1 → 0,000 m/s² (Δ 0,400). Separare: 6/6 perechi cu Δ 0,000 (fiecare cheie inertă în scenariile celorlalte). Compatibilitate M: 100/100 cereri 047 identice cu cheile R neutre vs active, primul tick de frânare 73 neschimbat, rampa neutră se stabilizează la −2,00 m/s² / brake 0,25.

Fișiere și documente actualizate: `src/autonomy/accel-policy.ts` (nou), `src/autonomy/index.ts` (export la final), `tests/autonomy/accel-policy.test.ts`, `tests/autonomy/accel-policy-reference.ts`, `tests/autonomy/accel-policy-report.ts` (nou), `scripts/run-v2-accel-policy-report.mjs` (nou), `package.json` (scriptul `accel:policy`, ultima intrare), `Docs/11-catalog-parametri.md` (secțiune nouă la final), `Docs/Evidence/169-v2-accel-policy/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: registry-ul 092 păstrează `implemented: false` pentru cele patru chei, deci `MANUAL_TUNING`/`LEARNED` rămân refuzate; valorile se consumă din `BASE`/`IMPORTED`. Ca și 046/047/048/167, stratul nu este încă montat în bucla live de simulare. `braking_jerk` maxim (20 m/s³) atinge o cerere de 2 m/s² în șapte tick-uri; aplicarea instantanee ar cere un jerk infinit, în afara catalogului, deci echivalența neutră este o rampă mărginită. Pragurile `launchSpeedMps = 2` și `coastingDemandMps2 = 0,6` sunt constante documentate ale contractului, nu chei de catalog.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '169' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare finalizată în `loop-pbi/v2-policy-169-01`; contract `169-accel-policy-v1`, teste 10/10, raport 19/19, suita completă 2983/2983; fișier mutat fizic în Done.
