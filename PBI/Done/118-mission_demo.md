---
id: "118"
title: "Misiunea prima demonstrație și dovezi"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["117","112"]
owner: "loop-pbi/missions-118-120-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T16:38:03+03:00"
completed_at: "2026-10-22T16:38:49+03:00"
---

# 118 Misiunea prima demonstrație și dovezi

## Obiectiv

Construiește un traseu LEARNING cu dovezi suficiente și acțiunea Vezi un exemplu pentru efectul publicat.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 117 trebuie să existe în Done înainte de începere.
- PBI 112 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Misiunea cere un delta justificat și activare observată, fără fabricația datelor.
- [x] Demonstrația fără dovezi explică no-change; exemplul live sau experimentul separat este etichetat.

## Verificare

Testează demonstrație informativă și segment fără dovezi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/app/mission-demo.ts` cu schema `118-mission-demo-v1` implementează etapa 2 a campaniei (`campaign-2-first-demonstration`, definiție 116) ca traseu real de learning. Misiunea cere un delta justificat și o activare observată, iar ambele sunt calculate din module reale, nu scrise de mână: segmentul LEARNING 069 produce dovezi prin 085 (300 de eșantioane reale), 086 (4 oportunități STOP reale, numitori reali), 087 (4 ferestre `FREE_TRAFFIC`/`ELIGIBLE`, expunere reală de 40 de tick-uri), 088 (`PREFIX_ELIGIBLE`), 093 (read model real `READY`, 4 episoade distincte pentru `stop_full_probability`) și 097/098 (candidatul real 098 `CANDIDATE` cu valoarea 1; 097 rulează și refuză în mod real cu `ZERO_CERTAIN_RED_DENOMINATOR`, pentru că nu există oportunitate RED). Episoadele și candidatul intră în coada reală 103, poarta 102 acceptă compoziția, 112 derivează versiunea reală 109 `segment-118-demo~112` din părintele `city-profile-118-base`, 110 publică și aplică activarea la tickul 1 pe toate cele 64 de vehicule (24 taxiuri, 40 civili), iar 104 citește explicația `CHANGED` din același job/outcome folosit de pipeline. Valorile reale: bază 0.6 → valoare publicată 0.8 (delta 0.2), candidat 098 = 1, 4 episoade distincte și 4 efective, stare 100 `OBSERVED`, context `FREE_TRAFFIC`, flotă pe `segment-118-demo~112`. Segmentul fără dovezi eligibile rezultă `NO_CHANGE` cu motiv închis: read model 093 `NO_EVIDENCE`, candidat 098 `REFUSED`, compoziția 103 păstrează valoarea, 112 nu derivează versiune, 110 nu primește comandă, iar cadrul 104 este `NO_CHANGE` cu `versionId: null`, motivul `NO_NEW_EVIDENCE` și contextele lipsă enumerate. Acțiunea „Vezi un exemplu" este etichetată: `LIVE` cu proveniența 109 (versiune, părinte, checksum, segment sursă, delta) după publicare, `EXPERIMENT` cu profilurile cunoscute 105 (`PRUDENT`, `IMPULSIVE`, `RECKLESS`, `MIXED`) și `isPlayerEffect: false` când nu există versiune publicată. Pipeline-ul de publicare a profilurilor nu a fost modificat.

Verificări executate și rezultat: `npm run typecheck` EXIT 0; `npm run lint` EXIT 0; `npm run format:check` EXIT 0 („All matched files use Prettier code style!"); `npm run check:architecture` EXIT 0 (281 fișiere TypeScript, 13 sonde negative PASS); `npm run check:parameter-catalog` EXIT 0 („Parameter catalog is synchronized."); `npm test` 1986 teste, 1986 pass, 0 fail (73,5 s); `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-demo.test.ts"` 10 teste, 10 pass, 0 fail; `npm run missions:demo` 66/66 verificări PASS, 5 scenarii, `overall PASS`, cu `report.json` și `report.md` scrise în `Docs/Evidence/118-mission-demo/`.

Fișiere și documente actualizate: `src/app/mission-demo.ts` (nou), `src/app/index.ts` (exporturi publice), `tests/missions/mission-demo-fixture.ts` (nou), `tests/missions/mission-demo.test.ts` (nou), `tests/missions/mission-demo-report.ts` (nou), `scripts/run-mission-demo-report.mjs` (nou), `package.json` (scriptul `missions:demo` la finalul blocului `scripts`), `Docs/13-misiuni-si-progres.md` (secțiunea contractului 118), `Docs/Evidence/118-mission-demo/README.md` și `report.json`/`report.md`, `PBI/Done/118-mission_demo.md`.

Limitări sau follow-up: cele două scheme de identitate de fereastră ale contractelor actuale diferă (087 `eligibility-entry:*`, 088 `telemetry-window:*`), iar 093/098 cer aceeași identitate pe ambele înregistrări; fixture-ul leagă fereastra reală 088 de fereastra reală 087 a aceleiași oportunități, fără să invente vreo valoare, oportunitate, tick sau estimare. Transportul workerului 103 este port injectat care răspunde cu rezultatul real 101 `blendProfileValue`; coada, guvernorul 221, poarta 102, pipeline-ul 112, magazinul 109, activarea 110 și explicația 104 rulează real. Segmentul demonstrează valoarea de bază a profilului curent, deci un segment ulterior trebuie să declare valoarea de bază a capului acceptat, altfel 112 compară valoarea compusă cu valoarea capului și derivează o versiune; regula 112 rămâne neschimbată. Lumea demonstrației este flota deterministă (24 taxiuri, 40 civili), fără bucla de joc integrată, fizică continuă sau sesiune umană; nu se măsoară FPS, GPU sau hardware. Nu sunt în contract: UI-ul de misiuni, XP-ul, persisterea și compoziția cu `main.ts`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '118' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-22: Implementat în worktree-ul `missions-118-120-01`: contractul `118-mission-demo-v1` cu traseul real 069 → 085/086/087/088/093/097/098 → 103 → 102 → 112 → 109 → 110 și explicația 104, plus acțiunea „Vezi un exemplu" etichetată `LIVE`/`EXPERIMENT`. Verificări: typecheck, lint, format:check, check:architecture, check:parameter-catalog EXIT 0; `npm test` 1986/1986 pass; `npm run missions:demo` 59/59 PASS. Dovezi în `Docs/Evidence/118-mission-demo/`.
