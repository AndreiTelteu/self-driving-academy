---
id: "275"
title: "Campania, tutorialul și panoul de misiuni în jocul live"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["260","265","271"]
performance_checks: ["simulation","ui"]
owner: "loop-pbi/deepseek-275"
started_at: "2026-11-27T12:27:46.934Z"
completed_at: "2026-11-27T14:11:11.971Z"
---

# 275 Campania, tutorialul și panoul de misiuni în jocul live

## Obiectiv

Cele opt etape de campanie și tutorialul „primul taxi” rulează din evenimente reale, iar panoul arată obiective, progres, eșec și reluare.

## Starea actuală și ce lipsește

- Nu există tracker de campanie în compunerea live.
- Nu există tutorialul de cinci pași și nici separarea lui de învățare.
- Nu există panou de misiuni montat și nici buton în shell.
- Nu există ferestre de evaluare, buget de incidente sau motive de eșec live.
- Nu există recompense idempotente și nici reluare fără dublare.
- Nu există o probă de browser pentru etapa 1 și etapa 2.

## Context și plan

- [Misiuni și progres](../../Docs/13-misiuni-si-progres.md)
- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Campania pornește și obiectivele se calculează exclusiv din evenimente reale, nu din textul HUD.
- [x] Tutorialul parcurge cei cinci pași, nu produce learning și poate fi pus pe pauză sau sărit.
- [x] Panoul arată starea reală, progresul, fereastra, bugetul, motivul de eșec și reluarea disponibilă.
- [x] O misiune finalizată acordă recompensa o singură dată; o reluare nu dublează.
- [x] Eșecul păstrează profilul învățat și nu retrage XP.
- [x] O probă în browser arată etapa 1 completă și o misiune eșuată cu motiv.

## Verificare

- Teste pentru obiective, fereastră, buget, duplicat și replay.
- Probă în browser: tutorial, prima cursă, panoul de misiuni.
- Verifică recompensele și progresul după reload.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-missions.ts` (`275-live-missions-v1`) compune un singur tracker 116, un singur ledger 125 și un singur tutorial 117 peste faptele live: `PICKUP`/`DROPOFF` 265, `MANUAL_START`/`MANUAL_END` 271, `LEADER_ACQUIRED` 272, `PROFILE_ACTIVATE` 110/273 și `COLLISION` 007 numai cu ambele entități reale. Etapa 1 pornește automat; etapa următoare pornește numai după o finalizare reală, iar o misiune eșuată nu se reia automat. Tutorialul parcurge cei cinci pași din selecția și modul real, inclusiv AUTO după eliberarea scaunului `PLAYER`; cât timp este activ, hostul face segmentele LEARNING ineligibile pentru 273, deci tutorialul nu produce job, versiune sau scriere de profil. `recordAttemptFailure` consumă numărul real de încercare fără recompensă; reluarea se decontează normal, fără dublare. Shell-ul montează butonul nativ `Misiuni`, panoul 126 cu focus/Tab/Escape, suprafața 070 și citiri la 10 Hz numai cât timp este deschis; panoul arată fereastra, bugetul, motivul și reluarea.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (476 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run missions:live -- --check` — PASS. Teste țintă 30/30. `npm test` integrat: 3.735 teste, 3.721 pass, 0 fail, 14 skip-uri istorice. Raport 24/24: tutorial 5/5 `COMPLETED` prin `PLAY`, 0 joburi/versiuni; etapa 1 `COMPLETED`, XP 100, 2 recompense acordate o singură dată, etapa 2 pornită; reluare attempt 2 cu XP 100 și 2 recompense duplicate; eșec `FAILED/SCENARIO_RESET`, XP 100→100, `profileWrites: 0`; fereastră 18.000 tick-uri → `EVALUATION_WINDOW_EXPIRED`; buget 1→2 coliziuni → `INCIDENT_BUDGET_EXCEEDED`; panou cu 8 misiuni, stare/progres/fereastră/buget/motiv/reluare. Browser probe 22/22 PASS, Chrome 157/WEBGL2, 1024×640: taxi real `…TAXI4:0012`, ride `…w0005:r0005`, pickup `sz:1-1`→dropoff `sz:1-0`, boarding 1998, completion 6860; etapa 1 `COMPLETED`, 100 XP, 2 recompense o singură dată; tutorial prin joc cu 1 segment ineligibil, 0 joburi/versiuni; reset real → etapa 2 `FAILED/SCENARIO_RESET`, XP și amprenta profilului neschimbate; panou `data-failure="SCENARIO_RESET"`, `data-replay="true"`; 0 erori de pagină/consolă; 9 capturi în `Docs/Evidence/275-live-missions/screenshots/`.

Fișiere și documente actualizate: `src/app/live-missions.ts`, `src/missions/rewards.ts`, `src/missions/index.ts`, `src/app/index.ts`, `src/ui/game-shell-host.ts`, `src/main.ts`, tests missions/UI, `scripts/run-live-missions-report.mjs`, `scripts/run-live-missions-probe.mjs`, `package.json`, `Docs/13`, `Docs/31`, `Docs/README.md`, `README.md`, `Docs/game-shell.md`, `Docs/responsive-layout.md`, `Docs/ui-accessibility.md`, `Docs/Evidence/275-live-missions/`.

Limitări sau follow-up: Producătorul live 028 de coliziuni nu este montat; bugetul de incidente este evaluat din 007 `COLLISION` numai când faptul are ambele entități, iar eșecul din browser este `SCENARIO_RESET`. Persistența după reload rămâne 278; creditarea XP în `PlayerProgress` rămâne 276; provocările random rămân 277. Panoul 126 este read-only; reluarea este afișată, dar pornirea ei rămâne a hostului (`MissionTracker.replay`). Proba de browser este Chrome headless/WEBGL2, fără playtest uman sau pretenție FPS/GPU/hardware. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '275'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-275`; integrat, verificat și mutat în Done.
