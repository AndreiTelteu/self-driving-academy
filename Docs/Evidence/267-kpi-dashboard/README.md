# 267 — Panoul KPI, tabloul orașului și feedbackul consecințelor

Implementare locală la 27 noiembrie 2026. PBI 267 montează în shell-ul jucabil exact read model-urile
livrate de 209/210/214/082/061/065: popup-ul KPI, tabloul orașului și HUD-ul de consecințe. Nu creează
un al doilea ledger, o a doua flotă, istoric comercial sau model de simulare.

## Ce s-a livrat

- `src/app/kpi-dashboard.ts` (`267-kpi-dashboard-composition-v1`): `readKpiHistory` peste selecția 210,
  `readKpiImpact` peste serviciul 214 plus modul real și termenul 139 al ultimului review,
  `rideTripDistanceM` din lungimile reale ale rutelor 033.
- `src/ui/city-dashboard-panel.ts` (`267-city-dashboard-panel-v1`): dialogul host al tabloului 082,
  cu citire doar cât timp este deschis, plafon 10 Hz, Tab/Escape și focus restaurat.
- `src/ui/game-shell-host.ts`: butoanele native `KPIs` și `Oraș`; `src/main.ts` montează panourile,
  hotkey-ul `K` al hostului și un `createFleetHealth` real peste flota 264/265.
- `src/input/keyboard-drive.ts`: un dialog `[hidden]` nu mai blochează tastele de condus.
- `src/ui/kpi-history.ts`: portul opțional `onClose`, ca hostul să readucă focusul pe canvas.

## Dovezi deterministe

```powershell
npm run kpi:dashboard
npm run kpi:dashboard -- --check
```

`tests/ui/kpi-dashboard-report.ts` produce [report.json](report.json) și [report.md](report.md):
15/15 verificări pe 12 luni reale 209, 310 zile exacte → 52 puncte, 310 settle-uri și 284 review-uri.

- Lunile 0–11 sunt cele 209; luna 3 este `NO_DATA` cu `null` și „fără date”, luna 6 este un zero real
  (`0 SDA`, 30 curse terminale, 4 review-uri), luna 11 este `PARTIAL` cu proiecție `PROJECTED` și
  pragurile 10 curse / 300 s.
- Media ferestrei este `ratingSum / reviewCount` = 2,552817; media mediilor lunare ar fi 2,5.
  Distribuția este 49/45/45/45/45/55.
- Popup-ul închis nu citește și nu randează; deschiderea face exact o citire, iar după Escape citirile
  rămân 1. `historyScans` este 0 înainte și după, iar settle-urile și review-urile rămân 310/284.
- HUD-ul 214 face 600 tick-uri → 100 citiri, 2 randări, 4 scrieri de plan; XP 0/0 și nicio promisiune
  de pierdere.
- Tabloul orașului are 7 indicatori, 2 incidente reale (o coliziune 028 și un blocaj 065) și o singură
  citire la deschidere; după Escape nu mai citește. 4/7 indicatori sunt disponibili, restul sunt
  `UNAVAILABLE` explicit.

## Dovada în browser

```powershell
npm run kpi:dashboard:probe
```

[Browser report](browser.md) / [browser.json](browser.json): 26/26 verificări pe Chromium
159.0.8154.6, viewport 1280×720, în două pagini reale din același build:

- fixture-ul real 209/210/214/082/061/028/065: deschidere KPI cu 12 luni, luna fără date inspectată,
  Tab în dialog, Escape și focus restaurat, oraș cu 7 indicatori și 2 incidente, 600 tick-uri de
  feedback;
- buildul live: butoanele `KPIs`/`Oraș`, hotkey-ul `K`, suprafața 070 `kpis`/`city`, Escape și zero
  citiri cât timp panoul este închis; `historyScans` 0.

Capturi: [KPI](screenshots/01-kpi-fixture.png), [oraș](screenshots/02-city-fixture.png),
[build live](screenshots/03-live-shell-kpi.png).

## Verificări executate

- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm run format:check` — PASS.
- `npm test` — PASS (înregistrat în raportul de integrare al orchestratorului).
- `npm run build` — PASS.
- `npm run check:architecture` — PASS.
- `npm run composition:report -- --check` — PASS.
- `npm run docs:check -- --check` — PASS.
- `npm run kpi:dashboard` / `-- --check` — 15/15, PASS.
- `npm run kpi:dashboard:probe` — 26/26, PASS.

## Limite

- 12 luni apar după ce istoricul le acoperă; o lume nouă arată doar luna curentă, fără sloturi
  inventate înainte de epoch.
- Producătorii live 028/029/137/138/139 nu sunt montați (282/283/272/273), deci coliziunile,
  încălcările și confortul sunt `UNAVAILABLE`, nu zero; blocajele sunt zero real cât timp 065 nu are
  fapte. Misiunea 116/125 este `NONE` până la 276.
- Panourile nu persistă după reload; persistența este 278.
- Proba de browser verifică montarea, focusul, citirile și cele 12 luni din fixture, nu un playtest
  de 12 luni în timp real; nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
