# PBI 277 — provocările random live

Dovezile implementation-ului `277-live-challenges-v1`:

- [`report.json`](report.json) / [`report.md`](report.md) — raportul determinist (23/23).
- [`browser.json`](browser.json) / [`browser.md`](browser.md) — proba de browser (PASS, 10/10).
- [`screenshots/`](screenshots/) — ofertă, instanță activă, rezultat și reload.

## Ce s-a măsurat

Raportul determinist folosește fixture-ul 277 (16 zone 032, un taxi mutabil și ledgerul 213 real) și
demonstrează:

- o singură ofertă vizibilă; a doua cerere → `OFFER_ALREADY_ACTIVE`;
- refuz → `DECLINED`, 0 XP, 0 intrări, cooldown 10.800 tick-uri; a doua ofertă → `COOLDOWN_ACTIVE`;
- accept cu pasager → `PASSENGER_ABOARD`, pasagerul rămâne pe loc; accept liber → taxi rezervat;
- ofertă infezabilă → `NO_ELIGIBLE_TEMPLATE` cu `DEADLINE_INFEASIBLE` și fără afișare;
- demolare → refuz înainte de afișare, `CAPABILITY:DESTRUCTIBLE_DECOR` și
  `FACT_SOURCE_UNAVAILABLE:DISTRUCTION`;
- parcare reală → `COMPLETED`, 80 XP, o singură intrare de ledger, `FIRST_RECORD`;
- a doua reușită a aceleiași familii → 0 XP, tot o intrare de ledger;
- checkpointuri reale → `COMPLETED` 2/2, din traversări de poligon 032;
- Haos → 0 XP, 0 intrări, 1 record local;
- reload → același record, aceeași recompensă, fără dublare;
- panoul → ofertă/rezultat, `ACCEPT`, `DECLINE`, `CONTINUE`, `RETRY` dezactivat după succes,
  0 listeneri globali.

Proba de browser conduce real în Chrome 157/WEBGL2, viewport 1024×640:

- ofertă de precizie `challenge-influencer-single-frame`, seed 300, țintă 2 checkpointuri;
- taxi preluat, traseu 041, checkpointurile `sz:0-2`/`sz:0-3` traversate;
- `COMPLETED 2/2`, 90 XP, o singură intrare de recompensă, `FIRST_RECORD`, cooldown 10.577;
- „Mai încearcă” → `NOT_FAILED`, fără dublare;
- demolare → `NO_ELIGIBLE_TEMPLATE` cu `CAPABILITY:DESTRUCTIBLE_DECOR`;
- reload → recordul și 90 XP rămân, tot o singură intrare de recompensă.

## Comenzi

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run challenges:live
node --import ./scripts/register-typescript.mjs scripts/run-live-challenges-report.mjs --check
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run challenges:live:probe
npm run check:architecture
npm run composition:report -- --check
npm run docs:check -- --check
npm run build
npm test
```

## Limite

- `TIMED_DROPOFF`, `COMFORT`, `DISTRUCTION` și `LEARNING` nu au încă un producător live complet;
  sunt excluse înainte de ofertă, nu finalizate pe text.
- Proba este Chrome headless cu input real și poziția autoritară a compunerii; nu înlocuiește un
  playtest uman și nu măsoară FPS/GPU/hardware.
- Checkpointul este `sessionStorage` (reload de tab), nu savefile-ul durabil al lui 278.
- Driftul are colector live de fapte, dar proba de browser acoperă doar precizia/checkpointurile.
