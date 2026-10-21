---
id: "138"
title: "Indicatori de stil și încălcări"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["137","086"]
owner: "opencode deepseek-v4.1-flash behavior-metrics-01"
started_at: "2026-10-21T18:42:51.332Z"
completed_at: "2026-10-21T22:05:01+03:00"
---

# 138 Indicatori de stil și încălcări

## Obiectiv

Calculează probabilități de conformare, viteze, distanțe și reacții.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 137 trebuie să existe în Done înainte de începere.
- PBI 086 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] STOP și roșu se raportează per oportunitate eligibilă.
- [x] Cadrele duplicate nu schimbă denominatorul.

## Verificare

Compară date cu framerate-uri și oportunități diferite.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Serviciul `138-behavior-metrics-v1` numără o singură unitate per `(opportunityId, occurrence)` rezolvată, nu per `eventId`, cadru sau tick. STOP și RED sunt raportate separat, fiecare cu oportunități eligibile, succese, încălcări și rată procentuală; YIELD și LANE_CHANGE au aceleași rânduri, iar un agregat `ALL` este disponibil. `MISSED` și `ABORTED` sunt eșecuri, dar nu încălcări; `CROSSED_WITHOUT_STOP`, `CROSSED` și `PROCEEDED` sunt încălcări, derivate din tabelul real 086. Cadrele duplicate pentru aceeași apariție sunt `DUPLICATE` și nu schimbă niciun acumulator; aparițiile distincte se numără separat chiar dacă au același `opportunityId`. Proba 10 Hz vs 60 Hz trimite aceleași 4 apariții ca 40, respectiv 240 de evenimente și produce identic `eligible=4`, `successes=2`, `violations=2`, 50%/50%; diferă doar numărul de duplicate. Denominatorul zero produce `UNAVAILABLE` cu `value:null` și `NO_OPPORTUNITIES`, niciodată 0%/100%; un zero real cu denominator pozitiv este `AVAILABLE` 0. Viteza are medie exactă, mediană/p90 din histogramă mărginită, iar durata/fracția peste limită folosesc doar eșantioane cu limită reală (`NO_LIMIT` altfel). Headway este raportat doar pentru viteze eligibile (≥0.1 m/s), altfel `NO_ELIGIBLE_SPEED`/`NO_HEADWAY_SAMPLES`; reacția la verde doar cu `reactionTicks`, convertită la 60 Hz. Deduplicarea este mărginită (8192 FIFO), istoricul nu este păstrat (`historyScans:0`), iar snapshoturile sunt înghețate. Adaptorul 082 expune doar `violations`, fără a modifica contractul 082; confortul rămâne 139.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (246 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1704/1704 pass, 0 fail; `npm run metrics:behavior` 58/58 verificări, 7 scenarii, overall PASS; `npm run metrics:behavior -- --check` „Behavior metrics report is current”. Testele țintite 138: 21/21 pass. Raportul acoperă STOP per oportunitate, RED per oportunitate, duplicate 10 Hz vs 60 Hz, denominator zero, zero real, eligibilitatea viteză/headway și reacția la verde. Dovezi: [report.json](../../Docs/Evidence/138-behavior-metrics/report.json), [report.md](../../Docs/Evidence/138-behavior-metrics/report.md), [README](../../Docs/Evidence/138-behavior-metrics/README.md).

Fișiere și documente actualizate: `src/experiments/behavior-metrics.ts`, `src/app/behavior-metrics.ts`, `src/experiments/index.ts`, `src/app/index.ts`, `tests/experiments/behavior-metrics.test.ts`, `tests/experiments/behavior-metrics-report.ts`, `scripts/run-behavior-metrics-report.mjs`, `package.json`, `Docs/behavior-metrics.md`, `Docs/14-experimente-si-indicatori.md`, `Docs/metric-service.md`, `Docs/README.md` și `Docs/Evidence/138-behavior-metrics/`.

Limitări sau follow-up: Nu există captură browser, FPS, GPU sau măsurători hardware; validarea este funcțională izolată (`targeted`). Mediana/p90 sunt estimări din histogramă mărginită (eroare ≤ jumătate de bucket), fără istoric complet de eșantioane. Fracția peste limită este ponderată pe eșantioane în intervalul declarat, nu o integrală continuă. Fereastra de deduplicare este mărginită, deci o reluare foarte veche, peste 8192 chei, poate fi numărată din nou. Eligibilitatea este decisă de 087/apelant; 138 numără fiecare apariție distinctă forwardată și nu o reclasifică. Reacția/dwell nu sunt în înregistrarea 086; hostul le furnizează opțional, altfel rămân `null`. Distanța rămâne la 137, confortul la 139, iar adaptorul 082 expune doar `violations`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '138' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: denominator per oportunitate/apariție, STOP/RED separat, duplicatele nu schimbă numitorul, independență de framerate, zero real vs indisponibil, viteză/headway/reacție eligibile; 21 teste, raport cu 58 de verificări și documentație. Mutat fizic în Done după validare.
