# 270 — proba de browser a panoului companiei

Generată de `npm run company:dashboard:probe`; Chromium 157.0.8103.51, viewport 1440x900,
tick 6480100.

Două pagini reale din același build:

1. `tests/ui/company-dashboard-fixture.html`: panoul real 270 peste ledgerul real 268 și evoluția
   reală 269. Proba a deschis panoul, a verificat focusul și Tab, a cumpărat un taxi, a cumpărat
   upgrade-ul de service, a avansat la luna simulată următoare și a citit profitul acelei luni.
2. `index.html`: buildul jocului. Butonul nativ `Companie` din shell a deschis dialogul prin
   `src/main.ts`, suprafața 070 a fost activă, iar Escape a închis panoul fără citiri cât timp a
   fost închis.

| Metric | Value |
| --- | ---: |
| Cash before / after purchase | 55100 / 43100 SDA |
| Cash after upgrade | 35100 SDA |
| Level before / after purchase | 1 / 2 |
| Taxis before / after purchase | 20 / 21 |
| Service month 0 → next month | 800 → 80 SDA |
| Next month revenue / profit | 5200 / 700 SDA |
| Pending effects before / after | 0 / 1 |
| Panel reads closed / after open | 0 / 1 |
| Live shell reads closed / after open | 0 / 1 |
| Live surface open / closed | true / false |
| historyScans | 0 |
| XP / economy / profile writes | 0 / 0 / 0 |

Capturi: [screenshots/01-company-dashboard.png](screenshots/01-company-dashboard.png), [screenshots/02-live-shell-company.png](screenshots/02-live-shell-company.png).

- `closed-no-read`: PASS — reads 0, renders 0, open false
- `open-reads-once`: PASS — open true, reads 1, renders 1
- `open-surface`: PASS — surface true
- `open-focus`: PASS — focus close
- `panel-dialog`: PASS — 1 dialogs
- `tab-body`: PASS — focus body
- `escape-closes`: PASS — open false, surface false, escapes 1
- `escape-restores-focus`: PASS — focus company-trigger
- `purchase-confirmation`: PASS — Confirmă cumpărarea „Taxi compact 1” pentru 12000 SDA. Efect: Adaugă un taxi compact în flota live.ConfirmăAnulează
- `purchase-accepted`: PASS — purchases 1, cash 43100, level 2, taxis 21
- `purchase-owned`: PASS — OWNED
- `upgrade-confirmation`: PASS — Confirmă upgrade-ul „Contract de service” pentru 8000 SDA. Efect: Reduce costul Serviciu cu 50% de la începutul lunii simulate următoare.ConfirmăAnulează
- `upgrade-accepted`: PASS — upgrades 1, pending 1
- `next-month-service`: PASS — m0003 service 80
- `next-month-profit`: PASS — revenue 5200, profit 700, pending 0
- `history-scans`: PASS — 0
- `no-xp-economy-profile-writes`: PASS — 0/0/0
- `listeners`: PASS — 2
- `global-listeners`: PASS — 0
- `no-page-errors`: PASS — 0 page errors
- `no-console-errors`: PASS — 0 console errors
- `live-company-button`: PASS — 1 company buttons
- `live-closed-no-read`: PASS — reads 0 while closed
- `live-panel-open`: PASS — open true, reads 1
- `live-shell-surface`: PASS — panel company, surface true
- `live-focus`: PASS — focus close
- `live-escape-close`: PASS — panel null, surface false
- `live-no-page-errors`: PASS — 0 page errors
- `live-no-console-errors`: PASS — 0 console errors

Limitări: proba de fixture rulează modulele reale 268/269/270, nu o lume Babylon completă; proba
live deschide buildul real și verifică doar montarea, suprafața și focusul, nu cumpără upgrade-ul în
lumea live (nivelul și profitul live nu sunt pregătite pentru asta). Nu măsoară FPS/GPU și nu
înlocuiește gate-ul 287.
