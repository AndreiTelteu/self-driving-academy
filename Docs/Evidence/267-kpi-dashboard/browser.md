# 267 — proba de browser KPI, oraș și consecințe

Generată de `npm run kpi:dashboard:probe`; Chromium 159.0.8154.6, viewport 1280x720.

Două pagini reale din același build:

1. `tests/ui/kpi-dashboard-fixture.html`: popup-ul real 210 peste bucketurile 209, tabloul real
   082 peste 061/028/065 și HUD-ul real 214. Proba a deschis KPI, a inspectat luna fără date, a
   verificat Tab/Escape, a deschis orașul cu șapte indicatori și a rulat 600 tick-uri de feedback.
2. `index.html`: buildul jocului. Butonul nativ `KPIs` și hotkey-ul `K` deschid același dialog,
   suprafața 070 este activă, Escape închide și panoul închis nu citește.

| Metric | Value |
| --- | ---: |
| KPI months / month rows | 12 / 12 |
| KPI missing month | NO_DATA · fără date |
| KPI zero month | COMPLETE · 0 SDA |
| KPI reads closed / open / after close | 0 / 1 / 1 |
| City metrics / incidents | 7 / 2 |
| Impact ticks / reads / renders / writes | 600 / 100 / 2 / 4 |
| historyScans | 0 |
| Live panel reads closed / open | 0 / 1 |
| Live surface KPI / city / closed | true / true / false |
| Live historyScans | 0 |

Capturi: [screenshots/01-kpi-fixture.png](screenshots/01-kpi-fixture.png), [screenshots/02-city-fixture.png](screenshots/02-city-fixture.png), [screenshots/03-live-shell-kpi.png](screenshots/03-live-shell-kpi.png).

- `closed-reads-nothing`: PASS — KPI 0 citiri, oraș 0, historyScans 0
- `open-reads-once-and-12-months`: PASS — open true, reads 1, luni 12, rânduri 12
- `open-surface`: PASS — surface true
- `open-focus`: PASS — focus kpi-history__close
- `no-data-vs-real-zero`: PASS — lipsă NO_DATA/fără date, zero COMPLETE/0 SDA
- `tab-stays-inside`: PASS — focus kpi-history__body
- `escape-closes-and-restores`: PASS — open false, surface false, focus kpi-trigger
- `closed-after-escape-no-read`: PASS — reads 1, renders 1
- `city-seven-indicators`: PASS — 7 indicatori, 2 incidente, 1 citiri
- `city-surface`: PASS — surface true
- `city-escape-no-read`: PASS — open false, reads 1
- `impact-10hz-no-xp`: PASS — 600 tick-uri → 100 citiri, 2 randări, 4 scrieri
- `history-scans-zero`: PASS — 0
- `no-page-errors`: PASS — 0 page errors
- `no-console-errors`: PASS — 0 console errors
- `live-buttons`: PASS — 1 KPIs, 1 oraș
- `live-closed-no-read`: PASS — 0 citiri
- `live-open-reads-once`: PASS — open true, reads 1
- `live-shell-surface`: PASS — panel kpis, surface true
- `live-focus`: PASS — focus kpi-history__close
- `live-escape-close`: PASS — panel null, surface false, focus 
- `live-k-hotkey`: PASS — open true, opens 2
- `live-city-seven`: PASS — 7 indicatori, 7 carduri
- `live-history-scans-zero`: PASS — 0
- `live-no-page-errors`: PASS — 0 page errors
- `live-no-console-errors`: PASS — 0 console errors

Limitări: fixture-ul rulează modulele reale 209/210/214/082/061/028/065, nu o lume Babylon completă;
proba live verifică montarea, suprafața, hotkey-ul și focusul, nu parcurge 12 luni simulate în timp
real. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
