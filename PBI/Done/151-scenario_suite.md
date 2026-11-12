---
id: "151"
title: "Suita completă de scenarii V1"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["115","126","136","143","150","216"]
owner: "loop-pbi/suite-151-01"
started_at: "2026-11-12T03:07:24+02:00"
completed_at: "2026-11-12T03:20:06+02:00"
---

# 151 Suita completă de scenarii V1

## Obiectiv

Leagă scenariile de autonomie, cursă, învățare și campanie într-o suită reproductibilă.

## Context și plan

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 115 trebuie să existe în Done înainte de începere.
- PBI 126 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.
- PBI 143 trebuie să existe în Done înainte de începere.
- PBI 150 trebuie să existe în Done înainte de începere.
- PBI 216 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cazurile pozitive și negative au rezultate și toleranțe explicite.
- [x] Nu se declară trecute scenarii neexecutate.

## Verificare

Rulează întreaga suită pe versiunea fixată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: suita `151-scenario-suite-v1` este executabilă cu `npm run scenarios:v1` și leagă cele patru familii cerute pe contractele livrate, cu seed fix 151 și fără ceas de perete: AUTONOMY (4 scenarii pe politica 050), RIDES (3 pe ciclul 061 și flota reală 057/059/060), LEARNING (3 pe poarta 100 și pasul 101) și CAMPAIGN (3 pe tracker-ul 116 și ledgerul 125). Total 13 scenarii: 12 executate (12 PASS, 0 FAIL) și 1 `NOT_RUN` cu motiv (playtest în browser). Fiecare comparație are toleranță declarată: `EXACT` pentru stări/motive/contoare, `ABSOLUTE 1e-12 s`/`m` pentru ecouri de profil, `ABSOLUTE 1e-4 m/s` și `1e-4 ratio` pentru pasul de învățare, `ABSOLUTE 1e-6 episoade` pentru expunere, plus `ABSOLUTE 0` pentru contoarele de contract. Numerele reale: `START_DELAY` la 0,35 s din 0,7 s și `GREEN_RELEASE` exact la bornă; observație veche de 20 tick-uri refuzată `UNKNOWN`/`UNAVAILABLE`; cursă completă cu 5 tranziții și o singură eliberare la tick 14; dropoff ilegal refuzat cu starea și claim-ul neschimbate; greutate de învățare 0,15 → valoare 1,875 m/s pentru un episod și 0,6 → 3 m/s pentru 16 episoade; contradicție severă ține valoarea 1,5; prima misiune de campanie plătește 2 recompense și 100 XP o dată, iar rejucarea este `DUPLICATE` cu 0 XP. Refuzurile explicite acoperă fiecare familie (observație expirată, tranziție ilegală, contradicție de dovezi, finalizare duplicată). Din 216 s-au refolosit rândurile B5–B8 (daily 211/212, XP 213, amprenta XP fără pierderi și graful fără cicluri), iar din 056 cele 12 scenarii, 10 refuzuri și 5 probe de mutație; suita nu le reexecută sub alt nume, ci le citează cu dovada comisă și adaugă doar cazurile lipsă (green start delay, borna lui exactă, fereastra de observație).

Verificări executate și rezultat: `npm run typecheck` PASS (exit 0); `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS („All matched files use Prettier code style!”); `npm run check:architecture` PASS (354 fișiere TypeScript, probe negative 6+4+3 PASS); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` 2619 teste, 2619 trecute, 0 eșuate, 0 sărite, 87 478 ms; testele țintă `tests/scenarios/v1-suite.test.ts` 6/6 PASS; `npm run scenarios:v1` 13 scenarii, 12 executate, 12 PASS, 0 FAIL, 1 NOT_RUN, 9 pozitive, 4 negative, 2 surse refolosite, overall PASS; `npm run scenarios:v1 -- --check` „Scenario suite report is current” + „Scenario suite markdown is current”; două rulări independente au produs același fișier (`D56435127DA3DFDB8E50350F35CCF8EDBB598115A24F7134F5E395E90BB7FAC6`), iar amprenta scenariilor este `602a17e79db6d8ce70ebf75541df35b0f56778226ae7adbcd384f81a01789838`.

Fișiere și documente actualizate: `tests/scenarios/scenario-suite-support.ts`, `scenario-suite-autonomy.ts`, `scenario-suite-rides.ts`, `scenario-suite-learning.ts`, `scenario-suite-campaign.ts`, `v1-suite.ts`, `v1-suite.test.ts`; `scripts/run-scenario-suite-report.mjs` (nou, cu `--check`); `package.json` (intrarea `scenarios:v1`, ultima din blocul `scripts`); `Docs/18-validare-si-release.md` (secțiune nouă la final); `Docs/Evidence/151-scenario-suite/{README.md,report.json,report.md}`; fișierul PBI mutat fizic în `PBI/Done`. `src/` nu a fost modificat și nu a fost găsit niciun defect de business.

Limitări sau follow-up: nivel determinist în Node, fără browser real, GPU, input uman, FPS sau hardware de referință, deci playtestul rămâne `NOT_RUN` pentru gate-urile 153/220/224/235. Condusul de autonomie este politica 050 pe observații authoreză, nu fizica Babylon/Rapier live; cursa folosește fixture-ul real 057/059/060, nu o hartă de browser; învățarea este pasul candidat 101, fără publicarea profilului 109/112; campania folosește catalogul authoreză 116/125, iar daily 211 și XP 213 sunt refolosite din transcriptul 216, nu reexecutate. Suita nu înlocuiește un playtest uman și nu pretinde performanță de cadru.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '151' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-12: Implementare `loop-pbi/suite-151-01`: suită deterministă de 13 scenarii pe patru familii (12 executate PASS, 1 NOT_RUN declarat), toleranțe explicite, refuzuri per familie, refolosire 216/056 și raport cu `--check`; două rulări identice.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
