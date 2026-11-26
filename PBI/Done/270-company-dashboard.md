---
id: "270"
title: "Panoul companiei: profit, costuri, cash, flotă și investiții"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["268","269"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-270"
started_at: "2026-11-26T22:23:58.119Z"
completed_at: "2026-11-26T23:13:37.163Z"
---

# 270 Panoul companiei: profit, costuri, cash, flotă și investiții

## Obiectiv

Un panou read-only pentru finanțe și un flux de investiții permit jucătorului să vadă profitul, costurile, cash-ul și efectul achizițiilor.

## Starea actuală și ce lipsește

- Nu există buton sau dialog „Companie”.
- Nu există grafic revenue/costuri/profit pe lună și tabel pe perioade.
- Nu există detaliere pe categorie de cost și pe cursă.
- Nu există listă de achiziții/upgrade-uri cu cost, efect și stare.
- Nu există mesaje pentru fonduri insuficiente, nivel insuficient sau upgrade deținut.
- Nu există reguli de focus, Escape, Tab și cost când panoul este închis.

## Context și plan

- [Companie: profit și evoluție](../../Docs/32-companie-profit-si-evolutie.md)
- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Accesibilitatea interfeței](../../Docs/ui-accessibility.md)
- [Layout responsive](../../Docs/responsive-layout.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 268 trebuie să fie Done înainte de începere.
- 269 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Panoul arată revenue, costuri, profit, cash, valoare de flotă și nivel companie.
- [x] O lună fără date este `null`/„fără date”, iar un profit zero sau negativ real este afișat ca atare.
- [x] Graficul și tabelul folosesc aceleași agregate, fără medii ale mediilor.
- [x] Achiziția/upgrade-ul afișează costul, efectul și confirmarea; fondurile insuficiente blochează acțiunea.
- [x] Focusul, Tab, Escape și pauza respectă regulile celorlalte panouri.
- [x] Panoul închis nu citește ledgerul și nu randează.

## Verificare

- Teste de proiecție, zero vs fără date, refuz de fonduri și upgrade duplicat.
- Probă în browser: deschide panoul, cumpără un upgrade, verifică profitul perioadei următoare.
- Verifică accesibilitatea și costul UI.

## Dovezi de finalizare

Rezultat implementare: `src/ui/company-dashboard-format.ts` proiectează read model-ul 268/269 în revenue, costuri, profit, cash, valoare de flotă, nivel, grafic/tabel lunar, breakdown pe categorii, ultima cursă și oferte/upgrade-uri cu cost, efect, stare și refuzuri. `src/ui/company-dashboard.ts` montează panoul nativ cu confirmare în panou, apelând exclusiv porturile reale 269 `purchase`/`upgrade`. Butonul `Companie` este în shell host, panoul se deschide prin `shell.openPanel('company')` și suprafața 070, cu focus, Tab/Shift+Tab, Escape, restaurarea focusului, zero listeneri globali, actualizare la 10 Hz și `SKIPPED_CLOSED` fără citire/randare când este închis.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (466 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run company:dashboard -- --check` — PASS. Teste țintă 11/11. `npm test` integrat: 3.682 teste, 3.668 pass, 0 fail, 14 skip-uri istorice. Raport 33/33: 2/3 luni cu date, cash 55.100→43.100 după achiziție, serviciu 800→80 după upgrade, profitul lunii următoare 700 SDA; lună lipsă `fără date`, zero real 0, profit negativ real; grafic și tabel aceleași agregate; panoul închis 0 citiri/randări; refuzuri pentru fonduri, nivel și upgrade duplicat. Browser probe 29/29 PASS, Chrome/Chromium 157: panoul se deschide, focus pe Închide, Tab, Escape restaurează focusul, achiziție 55.100→43.100 și 20→21 taxiuri, nivel 1→2, upgrade 8.000 SDA, serviciu 800→80, profit 700, `historyScans: 0`, XP/economy/profile writes 0/0/0; capturi în `Docs/Evidence/270-company-dashboard/screenshots/`.

Fișiere și documente actualizate: `src/ui/company-dashboard-format.ts`, `src/ui/company-dashboard.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/main.ts`, `tests/ui/company-dashboard.test.ts`, fixture/report/browser helpers, `scripts/run-company-dashboard-report.mjs`, `scripts/run-company-dashboard-probe.mjs`, `package.json`, `Docs/31`, `Docs/32`, `Docs/README.md`, `Docs/Evidence/270-company-dashboard/`.

Limitări sau follow-up: Fixture-ul de browser rulează modulele reale 268/269/270, dar nu o lume Babylon completă; proba live-shell verifică montarea, suprafața și focusul, nu cumpără upgrade-ul în lumea live pentru că acolo nu există nivel/profit pregătit. Nu se pretinde FPS/GPU; costul UI este structural, conform politicii targeted. KPI popup (267), persistența (278), fizica (282) și learning-ul rămân separate. Node local 24.19.0, sub 24.21.0; browser probe a folosit un `PLAYWRIGHT_MODULE` extern.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '270'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-270`; integrat, verificat și mutat în Done.
