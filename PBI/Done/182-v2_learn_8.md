---
id: "182"
title: "Învățare extinsă pentru trasee și recuperare"
status: "Done"
release: "V2"
module: "Învățare V2"
depends_on: ["181","163"]
parameter_role: "estimator"
parameter_keys: ["route_time_weight","route_distance_weight","route_turn_penalty","route_signal_penalty","route_congestion_penalty","reroute_patience","u_turn_willingness","reverse_recovery_duration"]
owner: "loop-pbi/v2-learn-182-01"
started_at: "2026-11-13T02:50:34.025+02:00"
completed_at: "2026-11-13T09:39:07.679+02:00"
---

# 182 Învățare extinsă pentru trasee și recuperare

## Obiectiv

Construiește estimarea și dovezile pentru route_time_weight, route_distance_weight, route_turn_penalty, route_signal_penalty, route_congestion_penalty, reroute_patience, u_turn_willingness, reverse_recovery_duration. Folosește alternative de traseu comparabile și normalizează ponderile pentru a elimina ambiguitatea scării.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 181 trebuie să existe în Done înainte de începere.
- PBI 163 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie are context eligibil, incertitudine și validare pe date independente.
- [x] Datele neidentificabile păstrează cheia neobservată; constrângerile de grup sunt explicate.

## Verificare

Demonstrații sintetice și manuale cu contexte variate și cazuri fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `182-route-estimator-v1` din `src/learning/route-v2-estimator.ts` estimează cele opt chei R ale politicii 181 din opt contexte eligibile distincte, măsurate exclusiv din faptele comenzii reale 181 peste alternative produse de planificatorul livrat 041. Ponderile sunt tratate explicit ca **cote normalizate**: `share_k = w_k / Σw` face ca doar rapoartele să fie identificabile, deci estimatorul raportează reprezentantul canonic cu sumă 1 (`w_k := share_k`), nu o inversare a scorului brut. Rezultatul setului pozitiv (seed 182, 28 episoade, 0 refuzate): toate cele opt chei `CANDIDATE` și `VALIDATED` — `route_time_weight` 0,0724 ±0,0050, `route_distance_weight` 0,0354 ±0,0050, `route_turn_penalty` 0,2357 ±0,0164, `route_signal_penalty` 0,5891 ±0,0221, `route_congestion_penalty` 0,0674 ±0,0126, `reroute_patience` 19,9917 s ±0,05, `u_turn_willingness` 0,1042 ±0,0434, `reverse_recovery_duration` 4,0000 s ±0,05. Coeficienții demonstrați: `rho` 2,0467, `kappa_viraj` 2,1854, `kappa_semafor` 5,4636, `kappa_congestie` 0,6250. Cazurile neidentificabile rămân `UNOBSERVED` cu motive închise (întoarcere în U interzisă, recuperare pe podeaua de 2,5 s, recuperare blocată, răbdare cenzurată, raport timp/distanță pe o singură parte, penalizare cenzată, doi șoferi contrazicători, episoade MANUAL, fereastră fără prefix), iar zerourile demonstrate rămân candidate (U refuzat constant → 0; răbdarea de la podea → 2 s, minimul catalogului).

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 avertismente); `npm run format:check` PASS; `npm run check:architecture` PASS (385 fișiere TypeScript); `npm run check:parameter-catalog` PASS; `npm test` PASS (3153 teste, 3153 trecute, 0 eșecuri, 82660,16 ms); testul țintă `tests/learning/route-v2-estimator.test.ts` PASS (20 teste); `npm run route:learning` 22/22 verificări PASS, 8 chei candidate, 0 chei neobservate, digest `fnv1a32:e438ed74`; `npm run route:learning -- --check` PASS (raport actual, cod de ieșire 0). Compatibilitate dovedită: 12/12 decizii rejucate cu profilul estimat aleg exact ce alege profilul autorat, iar cotele raportate se renormalizează la ele însele prin 181.

Fișiere și documente actualizate: creat `src/learning/route-v2-estimator.ts`, `tests/learning/route-v2-estimator-reference.ts`, `tests/learning/route-v2-estimator-report.ts`, `tests/learning/route-v2-estimator.test.ts`, `scripts/run-v2-route-learning-report.mjs`, `Docs/Evidence/182-v2-route-learning/{report.json,report.md,README.md}`; modificat `src/learning/index.ts` (export la final), `package.json` (scriptul `route:learning` la finalul blocului `scripts`), `Docs/10-invatarea-stilului.md` (secțiune nouă la final).

Limitări sau follow-up: valorile din fixture sunt demonstrații plauzibile, nu date măsurate pe jucători; cotele raportate sunt reprezentantul cu sumă 1, nu ponderile autorate (orice altă scară dă aceeași politică); `turns` și `signals` rămân fapte declarate de proprietarul hărții, ca în 181; banda congestiei este cea mai largă (±0,0126) din cauza raportului mic de lungime al perechii; disponibilitatea de U cere eșantioane de ambele părți ale pragului; răbdarea nu poate fi demonstrată sub 2 s, minimul catalogului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '182' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: implementare completă în `loop-pbi/v2-learn-182-01`; contract `182-route-estimator-v1` livrat cu opt contexte eligibile, cote normalizate tratate explicit, validare independentă și 22/22 verificări ale raportului; mutat fizic în Done.
