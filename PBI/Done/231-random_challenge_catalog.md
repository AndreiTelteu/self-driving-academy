---
id: "231"
title: "Catalog de provocări neobișnuite și evaluatori"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["116","040","031","227","139"]
performance_checks: ["simulation", "memory"]
owner: "loop-pbi/challenges-231-01"
started_at: "2026-11-12T03:42:20+02:00"
completed_at: "2026-11-12T04:18:32+02:00"
---

# 231 Catalog de provocări neobișnuite și evaluatori

## Obiectiv

Definește catalogul minim de 12 șabloane cu obiective calculabile, dialog și prerechizite realizabile.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 116 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.
- PBI 031 trebuie să existe în Done înainte de începere.
- PBI 227 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Include urgență la maternitate/toaletă, influenceri, tort, destinație schimbată, terminal, tur, parcare și experiment de stil conform modulului 28.
- [x] Evaluatorii checkpoint/dwell/heading/confort/drift/distrugere și LEARNING au praguri/versionare; driftul nu se acumulează prin rotire pe loc sau impuls de coliziune.
- [x] Fiecare șablon declară sesiunea, zonele, bugetul de incidente, deadline-ul, rewardPolicy și regulile R/reluare.
- [x] Validatorul respinge zone/rute/evaluatori lipsă și obiective contradictorii; demolarea este Haos, iar scenele nu cer pietoni V2/mers V3.
- [x] Dialogurile reflectă evenimente reale și premisa de filmare rămâne internă, fără upload social sau date fabricate.

## Verificare

Verifică fiecare șablon într-un fixture realizabil și unul invalid, exactitatea evaluării și fallbackul; consemnează praguri și umorul din playtest.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

Rezultat: 12/12 fixture realiste trec, 12/12 fixture invalide sunt refuzate cu motiv închis, iar
fallback-ul de catalog mic este verificat prin bridge-ul zilnic (3 familii, 3 misiuni). Pragurile sunt
versionate și marcate propuneri de calibrare. Un playtest uman nu a fost executat; umorul și
calibrarea rămân pentru 235, consemnate ca limitare, fără a pretinde o măsurătoare.

## Dovezi de finalizare

Rezultat implementare: `src/missions/challenges.ts` livrează catalogul `231-challenge-templates-v1`
cu 12 șabloane distincte pe 6 familii (EFFICIENCY, EXPLORATION, DISCIPLINE, PRECISION,
CONTROLLED_DESTRUCTION, EXPERIMENT), 8 evaluatori puri versionați, prerechizite explicite cu excludere
numită, dialog legat de evenimente reale și premisa de filmare internă. `planChallengeAttempt` derivă
din seed ținta, deadline-ul fezabil, bugetul, zonele concrete și pragurile; `evaluateChallenge` aplică
o precedență fixă și întoarce un verdict înghețat cu amprentă deterministă. Driftul valid nu se
acumulează prin rotire pe loc sau impuls de coliziune (0 s în ambele cazuri, 240 de tick-uri
raportate), distrugerea numără obiecte distincte și este exclusiv Haos, iar comfortul nu poate depăși
pragurile 139. Bridge-ul `231-challenge-daily-bridge-v1` expune cele 3 șabloane cu obiectiv 116 real,
iar generatorul 211 produce în continuare 3 misiuni; restul de 9 șabloane și directorul/UI/XP rămân
pentru 233.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run
format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (358
fișiere TypeScript, probe negative PASS); `npm run check:parameter-catalog` sincronizat; testele
țintă 17/17 pass; `npm test` 2 672 teste, 2 672 pass, 0 fail, 90,66 s; `npm run missions:challenges`
66/66 verificări PASS, 1 200 evaluări, 12 amprente distincte; `npm run missions:challenges -- --check`
curent. Nivel `targeted`: simulation/memory raportate structural (22 200 rânduri de fapte, catalog
19 272 bytes), fără FPS, heap exact sau hardware.

Fișiere și documente actualizate: `src/missions/challenges.ts`, `src/missions/index.ts`,
`tests/missions/challenge-catalog-fixture.ts`, `tests/missions/challenge-catalog.test.ts`,
`tests/missions/challenge-catalog-report.ts`, `tests/missions/challenge-catalog-report.test.ts`,
`scripts/run-challenge-catalog-report.mjs`, `package.json`, `Docs/28-provocari-random-si-revenire.md`,
`Docs/Evidence/231-challenge-catalog/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: fără playtest uman (umorul și pragurile rămân propuneri, 235); fezabilitatea
rutei pe graful real și ofertele sunt 232; creditul XP, istoricul durabil, panoul și reluarea
persistentă sunt 233; `challengeHistoryEntries` este `null` în manifest, cu plafon propriu de catalog;
costul de perete/hardware este `NOT_MEASURED`.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă (vizual `N/A`, fără UI în acest PBI).
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '231'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: implementare și validare `targeted`; catalog de 12 șabloane, 8 evaluatori, bridge 211, 17 teste țintă și raport 66/66 PASS; fișier mutat în Done după verificarea finală.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
