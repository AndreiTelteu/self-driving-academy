---
id: "089"
title: "Normalizarea după clasa vehiculului"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["088","023","031"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium vehicle-normalization-01"
started_at: "2026-10-19T14:05:43+03:00"
completed_at: "2026-10-19T14:51:19+03:00"
---

# 089 Normalizarea după clasa vehiculului

## Obiectiv

Produce caracteristici care disting intenția de capacitatea mecanică.

## Context și plan

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 088 trebuie să existe în Done înainte de începere.
- PBI 023 trebuie să existe în Done înainte de începere.
- PBI 031 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Accelerația maximă a unei clase nu determină singură agresivitatea.
- [x] Datele limitate mecanic sunt marcate pentru estimator.

## Verificare

Compară aceeași comandă și stil în ambele clase.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/telemetry/vehicle-normalization.ts` (`createVehicleNormalizer`), exportat prin `src/telemetry/index.ts`. Fiecare fereastră eligibilă 087, cu prefixul utilizabil 088, primește caracteristici normalizate după plafonul **propriei** clase din 023/085: `accelerationDemand`, `decelerationDemand`, `lateralDemand` ca p90 al fracțiunii realizat/plafon, scalarul `aggressiveness = max(...)`, valorile brute SI și intenția independentă de clasă (throttle/brake/|steering|). **Criteriul 1 este impus prin construcție și asertat:** aceeași comandă și același stil dau aceeași cerere normalizată în sedan și compact (toleranță documentată 0,05), deși valorile brute păstrează raportul de capacitate 023 (1,371), iar o clasă cu plafon mai mic nu este citită ca prudentă — un sedan dur și un compact blând se inversează la valori brute dar se ordonează corect după stil la valorile normalizate. **Criteriul 2:** o cerere care satură susținut un plafon (≥3 tick-uri la ≥0,95) este marcată explicit `CAPABILITY_LIMITED` cu canalul limitativ și `aggressivenessIsLowerBound = true`, iar `emitIntentFeature` acceptă numai o fereastră `INTENTIONAL` (re-verificare la runtime), deci o capacitate plafonată nu poate deveni tacit stil deliberat. O fereastră neeligibilă 087, complet suprimată ori trunchiată este refuzată cu motiv închis și `features: null`; o fereastră `PARTIAL` este normalizată exclusiv pe prefixul utilizabil și poartă gradul 088.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **1008 teste / 1008 pass / 0 fail**, de la 1000; include cele 8 teste noi) și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei în worktree temporar la commit-ul integrat: `selfCheck.passed = true`, cost adăugat `observe` p95 **0,1518 ms/decizie** (raportat 113,6–164,1 µs), memorie `retained 4096 = capacitate`, `estimatedBytesMaximum 9.437.184 B (≈9 MiB) < recorderRamBytes`, `withinCeiling true`, `capabilityLimitedRetained 683` cu canalul `LONGITUDINAL_ACCELERATION`, `disposedCountersZero true` — deci marcarea de capabilitate există și sub sarcină, nu doar în teste. Testele acoperă linia de verificare: aceeași comandă și stil în ambele clase (normalizat egal în toleranță 0,05, brut în raportul 023 în 0,01), clasamentul după stil și nu după plafon (inversare la brut), saturarea marcată cu canalul limitativ și refuzul emiterii ca intenție, o singură excursie tranzitorie fără marcă, compoziția cu 087/088 (prefix utilizabil, refuz pentru `FULLY_SUPPRESSED`/`TRUNCATED`/neeligibil, downgrade la trunchiere ulterioară), plus o verificare măsurată în Rapier pe sedan și compact cu aceeași accelerație și un lanț real 023/047/049/086/087/088 la cadența 219.

Fișiere și documente actualizate: `src/telemetry/vehicle-normalization.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/vehicle-normalization.test.ts` (nou), `scripts/benchmark-telemetry-normalization.mjs` (nou), `Docs/vehicle-normalization.md` (nou), `Docs/09-telemetrie-si-oportunitati.md`, `Docs/README.md`, `Docs/Evidence/089-vehicle-normalization/` (README, checks, tests, ambele brațe native).

Limitări sau follow-up: probă nativă CPU/memorie deținută doar; fără browser/renderer/GPU/FPS, `frame` nedeclarat, gate-ul jocului integrat rămâne nevalidat. Cererea realizată din probă este comanda executată prin drivetrain-ul real 023 plus curbura reală 049, nu o rulare Rapier (aceea este testul unitar separat). Brațul compact reia comanda sedanului, pentru că 047 este conștient de clasă, iar canalul lateral nu este afirmat egal între clase (viteze diferite). Normalizatorul nu este încă legat în bucla live (rămâne la 095 și composition root). `estimatedBytes` este contor derivat, nu heap exact. Citirea eșantioanelor folosește un validator de graniță mai suplu decât descriptorul comun (aceeași semantică, fixată prin teste), documentat ca deviație de hot path.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '089' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia Telemetrie (085–088). Owner `opencode deepseek-v4.1-flash medium vehicle-normalization-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat normalizatorul, testele, cele două brațe native și documentația, cu commit-uri incrementale (`501f00ec`, `8d664db7`, `2bb37932`, `23ffcbe7`, `dd8db76d`, `9c95baf4`, `986cbe17`, `9cbfcd80`, `5bab550c`, `a47a9caf`); integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 1008/1008; catalog sincronizat) și ambele brațe ale sondei 089 (cost, memorie mărginită și 683 de ferestre marcate `CAPABILITY_LIMITED` sub sarcină); criterii bifate, dovezi completate, mutare fizică In Progress → Done.
