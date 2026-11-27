---
id: "276"
title: "Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc"
status: "Done"
release: "V1"
module: "Progres"
depends_on: ["260","265","271"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-276"
started_at: "2026-11-27T14:12:10.722Z"
completed_at: "2026-11-27T15:40:57.533Z"
---

# 276 Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc

## Obiectiv

Exact trei misiuni zilnice rulează pe ziua reală, XP-ul se acumulează idempotent din misiuni și timp activ, iar nivelul nu scade niciodată.

## Starea actuală și ce lipsește

- Nu există generator daily, calendar sau panou montat în shell.
- Nu există ledger XP, credit de misiune, credit daily sau timp activ.
- Nu există nivel, istoric XP sau afișare a soldului.
- Nu există excluderea pauzei, focusului, background-ului, AFK și Haos.
- Nu există reconciliere după reload, schimbare de zi sau ceas inversat.
- Nu există feedback fără mesaje de pierdere XP.

## Context și plan

- [Misiuni zilnice și XP](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [Misiuni și progres](../../Docs/13-misiuni-si-progres.md)
- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] La prima intrare a zilei există exact trei misiuni, cel puțin una MANUAL fără learning; reload-ul nu le rerandomizează.
- [x] XP-ul din misiuni, daily și timp activ este idempotent, cu fracții exacte și fără credit negativ.
- [x] Nivelul este derivat monoton din sold și nu scade la KPI, accident, misiune eșuată sau zi ratată.
- [x] Panoul arată XP, nivel, istoric, cele trei obiective, fereastra și motivul expirării.
- [x] Pauza, background-ul, focusul pierdut, AFK și Haos nu acordă XP Academie.
- [x] O probă în browser arată o misiune zilnică completată și soldul XP actualizat.

## Verificare

- Teste pentru trei daily, DST, rollback, expirare și duplicat.
- Probă în browser: completează un obiectiv, verifică XP și nivelul.
- Verifică amprenta XP după KPI negativ și misiune eșuată.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-daily-progress.ts` (`276-live-daily-progress-v1`) compune exact 211/212/213/125 peste faptele live 275. La prima intrare a zilei reale există exact trei misiuni, cu cel puțin una MANUAL fără learning; seed-ul 211 și checkpoint-ul de tab păstrează același set la reload. XP-ul vine din recompensele zilnice (100 XP), decontările 125 (100 XP) și timpul activ real (1 XP/minut, ferestre de maximum 30 s, fracții exacte); duplicatele și replay-ul plătesc 0, iar pauza, focusul pierdut, background-ul, AFK-ul, Haos, replay-ul și offline-ul nu acordă XP. Nivelul este derivat monoton din sold, iar KPI-ul negativ, accidentul, misiunea eșuată și ziua ratată nu au cale către ledger. Panoul nativ `Progres` arată soldul, nivelul, istoricul, cele trei obiective, fereastra, resetul, fusul și motivul expirării, cu focus/Tab/Escape și zero listeneri globali. Un checkpoint `sessionStorage` rebazat pe sesiunea de recovery păstrează ziua și XP-ul la reload; fișierul durabil rămâne 278.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (479 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run progress:daily -- --check` — PASS. Teste țintă 25/25. `npm test` integrat: 3.751 teste, 3.737 pass, 0 fail, 14 skip-uri istorice. Raport 49/49: exact 3 misiuni/3 sloturi, cel puțin una MANUAL; DST 82.800 s (23 h) și 90.000 s (25 h), gap 0 ms; rollback păstrează ziua și XP 300→300 cu 2 recompense; ultima milisecundă `ACTIVE`, granița `REJECTED/OUTSIDE_DAY`, obiectiv incomplet `EXPIRED` cu XP 200; duplicate 0 XP, daily duplicat 0 XP, replay 0 XP; timp activ 30 s = 0,5 XP, 70 s = 1,166666 XP; pauză/focus/background/AFK/Haos `SKIPPED`; daily + misiune 200+100=300 XP, nivel 3; amprenta XP `fnv1a32:9d86f950` neschimbată după KPI negativ/replay, `debits: 0`, `profileWrites: 0`. Browser probe 32/32 PASS, Chrome 157 headless/WEBGL2, 1024×640: obiective `FULL_STOPS`, `MANUAL_DROPOFFS`, `CLEAN_DROPOFFS`; 2 obiective completate, 2 recompense, 19 intrări, 302,524383 XP, nivel 3, panou `302.524383 XP`, `2/3` obiective, 12 rânduri de istoric; resetul păstrează amprenta `fnv1a32:e61cce9a`, reload-ul restaurează același set și XP cu 0 duplicate; capturi în `Docs/Evidence/276-daily-xp-progress/screenshots/`.

Fișiere și documente actualizate: `src/app/live-daily-progress.ts`, `src/app/live-missions.ts`, `src/app/index.ts`, `src/ui/live-progress-format.ts`, `src/ui/live-progress-panel.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/main.ts`, tests missions/UI, `scripts/run-live-daily-progress-report.mjs`, `scripts/run-live-daily-xp-probe.mjs`, `package.json`, `Docs/13`, `Docs/21`, `Docs/23`, `Docs/31`, `Docs/ui-accessibility.md`, `Docs/responsive-layout.md`, `Docs/Evidence/276-daily-xp-progress/`.

Limitări sau follow-up: `FULL_STOPS` și `LANE_CHANGES` există în catalogul 211, dar 275 nu publică încă evenimentele 272 corespunzătoare, iar `FULL_STOP` 272 nu are încă durata reală cerută de `minDurationS`; obiectivele rămân active până la follow-up. Checkpoint-ul de reload este `sessionStorage` (tab reload), nu un fișier durabil; persistența/autosave/importul rămân 278. Proba de browser este Chrome headless/WEBGL2, fără playtest uman sau pretenție FPS/GPU/hardware. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '276'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-276`; integrat, verificat și mutat în Done.
