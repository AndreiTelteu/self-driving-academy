---
id: "115"
title: "Demonstrarea orașului care copiază jucătorul"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["114","072","208","217"]
owner: "opencode deepseek-v4.1-flash vertical-slice-01"
started_at: "2026-10-21T22:47:19.295Z"
completed_at: "2026-10-22T02:10:51+03:00"
---

# 115 Demonstrarea orașului care copiază jucătorul

## Obiectiv

Verifică integrarea extinsă a orașului după prototipul 204, cu learning și stil comun taxi/civil.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 114 trebuie să existe în Done înainte de începere.
- PBI 072 trebuie să existe în Done înainte de începere.
- PBI 208 trebuie să existe în Done înainte de începere.
- PBI 217 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Stilul demonstrat în LEARNING este vizibil la taxiuri și civili, inclusiv greșelile.
- [x] MANUAL nu modifică stilul; explicația arată dovezile și contexte neobservate.

## Verificare

Playtest cu profil prudent și profil neregulamentar.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Slice-ul vertical `115-vertical-slice-v1` rulează două lumi izolate, `PRUDENT` și `RECKLESS`, de la baza 109 prin pipeline-ul real 112, activarea 110/208, metricile 138, explicația 104 și binding-ul 113. În scenariul prudent, `stop_full_probability` trece de la 0.6 la 0.84, se creează o singură versiune, iar histogramele TAXI și CIVILIAN ajung ambele pe aceeași versiune (20+20); cu 14 oportunități reale, atât taxiul cât și civilul au **0 încălcări**. În scenariul neregulamentar, aceeași cheie coboară la 0.36, ambele categorii adoptă versiunea, iar cele 14 oportunități produc **6 încălcări STOP** (3 taxi, 3 civil), reflectate în compliance 57.14% și în explicația 104 cu `next = 0.36` și deltă negativă. Explicația reală 103/104 arată 16 episoade efective pe cheie, contextul observat `FREE_TRAFFIC` și contextele neobservate explicit `GREEN`, `YIELD`, `LANE_CHANGE`. Faza MANUAL folosește același traseu și plan, înregistrează telemetrie (14 oportunități + 8 eșantioane de viteză), dar produce `SKIPPED_MANUAL`/`MANUAL_SEGMENT_NOT_LEARNABLE` fără job, versiune, activare sau schimbare de stil; versiunea activă și digestul valorilor rămân identice, iar explicația este `NO_CHANGE` cu `versionId: null`, fără dovezi inventate. Binding-urile 113 pentru taxi și civil raportează aceeași versiune și aceleași valori, ambele `pass`, cu `hiddenOverrides: []`. Două rulări independente sunt identice octet-cu-octet (amprentă `115-506f6d9b-40582`).

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (254 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1808/1808 pass, 0 fail; `npm run vertical:slice` 111/111 verificări, 7 rânduri, determinism PASS; `npm run vertical:slice -- --check` „Vertical slice report is current”. Testele țintite 115: 16/16 pass. Raportul acoperă prudent, neregulamentar, ambele categorii, greșelile vizibile, MANUAL fără schimbare, contextele neobservate și determinismul. Dovezi: [report.json](../../Docs/Evidence/115-vertical-slice/report.json), [report.md](../../Docs/Evidence/115-vertical-slice/report.md), [README](../../Docs/Evidence/115-vertical-slice/README.md).

Fișiere și documente actualizate: `src/app/vertical-slice.ts`, `src/app/index.ts`, `tests/app/vertical-slice.test.ts`, `tests/app/vertical-slice-report.ts`, `scripts/run-vertical-slice-report.mjs`, `package.json`, `Docs/vertical-slice.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/README.md` și `Docs/Evidence/115-vertical-slice/`.

Limitări sau follow-up: Playtest-ul este un playtest simulat determinist, nu un playtest uman sau de browser; nu au fost produse capturi sau Playwright. Explicația 104 poartă id-ul de compoziție 103 (`city-style-base-115~103.1`), în timp ce 112 stochează `segment-115-<scenario>~112`; raportul expune explicit această separare. Atașarea snapshotului 104 la 113 ar raporta corect `REASON_CODE_MISMATCH`, deci binding-ul este citit fără el și separarea este raportată. Contractul 104 respinge joburile MANUAL, deci explicația MANUAL este rezultatul real 112 `SKIPPED_MANUAL` proiectat ca `NO_CHANGE` fără versiune, nu un snapshot 104 fabricat. Contoarele per categorie sunt contoare ale acelorași fapte 086 care alimentează 138; 138 agregă întreaga flotă. Nu participă Rapier, renderer, FPS, GPU sau măsurători hardware; nu se certifică performanța jocului integrat.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '115' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-22: Implementare finalizată: două playtest-uri simulate (prudent, neregulamentar) prin pipeline/activare/ambele categorii, greșeli vizibile la neregulamentar, MANUAL fără schimbare de stil, explicație cu dovezi/contexte neobservate și determinism; 16 teste, raport cu 111 verificări și documentație. Mutat fizic în Done după validare.
