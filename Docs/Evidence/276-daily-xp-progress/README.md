# 276 — Trei misiuni zilnice, XP, nivel și progresul jucătorului

Dovezile sunt generate din contractele reale 211/212/213/125, compuse de
`src/app/live-daily-progress.ts` peste faptele live 275. Nu există un al doilea generator, ledger,
tracker sau store de profil.

## Comenzi

```powershell
npm run progress:daily
npm run progress:daily -- --check
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run progress:daily:probe
```

## Raport determinist

[report.json](report.json) și [report.md](report.md): **49/49 verificări**.

| Verificare | Rezultat |
| --- | --- |
| Daily la prima intrare | 3 obiective, sloturile 1–3 |
| MANUAL fără learning | 2 obiective (catalogul probei) |
| Set stabil în aceeași zi / reload | da / da |
| DST | 23 h (82 800 s), 25 h (90 000 s), gap 0 |
| Rollback | aceeași zi, 300 → 300 XP, 2 recompense |
| Expirare | ultima milisecundă `ACTIVE`, granița `REJECTED/OUTSIDE_DAY`, motiv `EXPIRED` |
| Daily XP | 200 XP din 2 recompense, o singură dată |
| Mission XP | 100 XP, duplicat 0, replay 0 |
| Timp activ | 30 s = 0,5 XP; 70 s = 1,166666 XP |
| Pauză / focus / background / AFK / Haos | `SKIPPED` cu motivul închis, sold neschimbat |
| Nivel | 3 după 300 XP; derivat monoton |
| Amprenta XP după KPI negativ / replay | `fnv1a32:9d86f950` neschimbată |
| Debit / profil | 0 / 0 |

## Probă de browser

[browser.json](browser.json) și [browser.md](browser.md): **PASS** în Chrome 157 headless/WEBGL2,
viewport 1024×640, tick 15–9459.

Secvența reală: start → tutorial sărit explicit → trei misiuni 211 citite → preluare taxi 265 →
condus manual până la pickup/dropoff 032 → `MANUAL_DROPOFFS` și `CLEAN_DROPOFFS` `COMPLETED` →
2 recompense zilnice, sold `302.524383 XP`, nivel 3, 19 intrări → panoul `Progres` a arătat
`302.524383 XP`, nivel 3, 2/3 obiective și 12 rânduri de istoric → „Oraș proaspăt” real → sold
`302.641383 XP` și amprenta `fnv1a32:e61cce9a` neschimbate → reload → același set de trei instanțe,
același sold, `restore: true`, 0 duplicate.

Capturi: [01-daily](screenshots/01-daily.png), [02-onboard](screenshots/02-onboard.png),
[03-daily-complete](screenshots/03-daily-complete.png),
[04-progress-panel](screenshots/04-progress-panel.png),
[04b-daily-panel](screenshots/04b-daily-panel.png),
[05-after-reset](screenshots/05-after-reset.png),
[06-after-reload](screenshots/06-after-reload.png).

## Fișiere

- `src/app/live-daily-progress.ts` — compunerea live 211/212/213/125, ziua reală, checkpointul de tab.
- `src/app/live-missions.ts` — observatori read-only pentru evenimentele 007 și decontările 125.
- `src/ui/live-progress-format.ts`, `src/ui/live-progress-panel.ts` — proiecția și panoul `Progres`.
- `src/ui/game-shell-host.ts`, `src/main.ts`, `src/ui/index.ts` — butonul, wiring-ul, active time, AFK.
- `tests/missions/live-daily-progress.test.ts`, `tests/missions/live-daily-progress-report.ts`,
  `tests/ui/live-progress.test.ts` — teste țintă.
- `scripts/run-live-daily-progress-report.mjs`, `scripts/run-live-daily-xp-probe.mjs` — dovezile.

## Limite

- `FULL_STOPS` și `LANE_CHANGES` sunt autorate de catalogul 211 și consumate de 212, dar 275 nu
  publică încă `FULL_STOP`/`LANE_CHANGE_COMPLETED` din 272; `FULL_STOP` 272 are `durationS: 0`, sub
  `minDurationS` real. Obiectivele rămân active până la un follow-up pe 272.
- Checkpointul este `sessionStorage` (reload de tab), nu un fișier de salvare; persistența durabilă,
  importul și autosave rămân 278.
- Proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un playtest uman
  și nu măsoară FPS/GPU pe hardware real.
- Nivelul de validare este `targeted`; raportul determinist nu certifică performanța jocului integrat.
