---
id: "267"
title: "Panoul KPI, tabloul orașului și feedbackul consecințelor în joc"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["266"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-267"
started_at: "2026-11-26T23:15:14.627Z"
completed_at: "2026-11-27T00:16:35.671Z"
---

# 267 Panoul KPI, tabloul orașului și feedbackul consecințelor în joc

## Obiectiv

Jucătorul vede revenue, rating, curse, review-uri, distribuție și consecințe reale, cu perioade, eșantioane și stări „fără date” corecte.

## Starea actuală și ce lipsește

- `createKpiHistory`, `createCityDashboard` și `createKpiImpactHud` nu sunt apelate din shell.
- Nu există buton „KPIs” sau hotkey `K` în jocul live.
- Nu există grafice lunare, tabel zilnic și distribuție 0–5 montate.
- Nu există tabloul orașului cu incidente, blocaje și confort.
- Nu există feedback scurt după o scădere de KPI, fără mesaj de pierdere XP.
- Nu există verificarea focusului, Escape, Tab și a costului când panoul este închis.

## Context și plan

- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Tabloul orașului](../../Docs/city-dashboard.md)
- [Accesibilitatea interfeței](../../Docs/ui-accessibility.md)
- [Layout responsive](../../Docs/responsive-layout.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 266 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Butonul KPIs și `K` deschid dialogul cu 12 luni, lună parțială, proiecție și „fără date” distinct de zero.
- [x] Tabloul orașului arată cei șapte indicatori și incidentele reale, fără valori inventate.
- [x] Feedbackul de consecințe apare după o schimbare reală și nu promite niciodată pierdere de XP.
- [x] Focusul intră în dialog, Tab rămâne în interior, Escape închide și readuce focusul.
- [x] Panoul închis nu citește ledgerul și nu randează; `historyScans` rămâne `0`.
- [x] Layout-ul rămâne lizibil la 1280×720 și pe zoom, fără suprapuneri.

## Verificare

- Teste de proiecție și accesibilitate pentru panouri.
- Probă în browser: deschide KPI, inspectează o lună fără date, închide cu Escape.
- Verifică `historyScans`, citirile și randările când panoul este închis.

## Dovezi de finalizare

Rezultat implementare: `src/app/kpi-dashboard.ts` compune KPI history 210, impact 214 peste economia 209, fidelitatea reală 139 și distanța planificată 033. Popup-ul KPI este montat cu buton `KPIs` și hotkey `K`, dialog cu 12 luni, `NO_DATA` ≠ zero real, lună `PARTIAL`, proiecție, medie ponderată, histogramă și puncte zilnice. Tabloul orașului are șapte indicatori și incidente reale 028/065, cu valori indisponibile explicite. HUD-ul 214 afișează trei planuri separate și nu promite pierdere XP. Panourile folosesc focus/Tab/Escape, suprafața 070, zero listeneri globali, 10 Hz și `SKIPPED_CLOSED` fără citire/randare.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (468 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run kpi:dashboard -- --check` — PASS. Teste țintă 22/22. `npm test` integrat: 3.698 teste, 3.684 pass, 0 fail, 14 skip-uri istorice. Raport 15/15: 12 luni, luna 3 `NO_DATA` revenue `null`, luna 6 zero real 0 SDA cu 30 curse/4 review-uri, luna 11 `PARTIAL` cu proiecție; media ponderată 2,552817 vs 2,5 media mediilor; distribuție 49/45/45/45/45/55; 310 zile exacte → 52 puncte; panou închis 0 citiri/0 randări, după open/close 1/1; `historyScans: 0`; 214 HUD 600 tick-uri → 100 citiri, 2 randări, 4 scrieri, `xpLossMessages: 0`; oraș 7 indicatori, 2 incidente reale, 4/7 disponibili. Browser probe 26/26 PASS, Chromium 159 1280×720: KPI, lună fără date, Tab/Escape/focus, 7 indicatori, 600 impact ticks, buton KPIs + K, `kpis`/`city` surfaces, 0 citiri când e închis, `historyScans: 0`; capturi în `Docs/Evidence/267-kpi-dashboard/screenshots/`.

Fișiere și documente actualizate: `src/app/kpi-dashboard.ts`, `src/ui/city-dashboard-panel.ts`, `src/ui/kpi-history.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/main.ts`, `src/input/keyboard-drive.ts`, `src/input/mode-keyboard.ts`, `src/input/recovery-input.ts`, `src/style.css`, `src/app/index.ts`, tests app/UI/browser/report, `scripts/run-kpi-dashboard-report.mjs`, `scripts/run-kpi-dashboard-probe.mjs`, `package.json`, `Docs/22`, `Docs/31`, `Docs/city-dashboard.md`, `Docs/Evidence/267-kpi-dashboard/`.

Limitări sau follow-up: O lume live nouă arată doar lunile scurse, nu 12 sloturi pre-epoch fabricate; fereastra de 12 luni apare după istoric, iar fixture-ul dovedește 12. Producătorii live 028/029/137/138/139 rămân 282/283/272/273, deci coliziunile, încălcările și confortul sunt `UNAVAILABLE`, niciodată zero; blocajele sunt zero real cât timp 065 nu are fapte. Misiunea este `NONE` până la 276; persistența panourilor rămâne 278. Proba de browser este Chromium headless 1280×720, fără FPS/GPU/hardware. Node local 24.19.0; `PLAYWRIGHT_MODULE` extern.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '267'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-267`; integrat, verificat și mutat în Done.
