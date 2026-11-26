# 266 — economia live: dovezi

Dovezile implementării `266-live-economy-composition-v1` peste contractele reale 061/265 și
economia neschimbată 209.

## Ce s-a probat

- **Raport determinist:** [report.json](report.json) și [report.md](report.md), produse de
  `npm run economy:live` pe fixture-ul real de 24 taxiuri și 20 civili, seed 262, dwell 24 tick-uri.
  47/47 verificări.
- **Curse terminale:** `COMPLETED` încasează tariful complet o singură dată (553 SDA pe traseul
  fixture-ului), `FAILED` rambursează integral și nu inventează review, `CANCELLED` fără pasager
  rambursează integral, `CANCELLED` cu pasager păstrează exact taxa de serviciu de 30%.
- **Review:** un review 0–5 per cursă evaluabilă, cu motive din vocabularul închis 209; cursa
  completă primește rating 5 și motivele `ON_TIME`, `SMOOTH_DRIVE`, `EFFICIENT_DELIVERY`. Trace-ul
  live a produs 140 de eșantioane și 128 de intervale 139 pe cursa completă.
- **KPI:** bucketurile de zi și lună păstrează revenue, curse, review-uri, `ratingSum`, histograma
  0–5 și expunerea. Ceasul este `209-economy-clock-v1` (1 200 s/zi, 30 zile/lună, 60 Hz).
- **Idempotență:** un tick re-livrat este `duplicate: true`; replay-ul explicit este `DUPLICATE`;
  după 600 de citiri revenue-ul și settle-urile rămân identice, iar `historyScans` este `0`.
- **Pauză/offline:** 600 de citiri fără niciun pas autoritar nu avansează tick-ul economic și nu
  produc revenue.
- **Civili:** un `vehicleKind: 'CIVILIAN'` este refuzat cu `CIVILIAN_NOT_BILLABLE` înainte de deviz
  și nu schimbă revenue-ul, settle-urile sau review-urile.
- **Epoca economică:** resetul pornește epoca 2, păstrează integral revenue-ul, settle-urile și
  review-urile epocii 1, iar cursa următoare se adaugă peste ele.
- **Browser:** [browser.json](browser.json) și [browser.md](browser.md) păstrează proba reală pe Chromium
  157 (WEBGL2, 1440×900): o cursă preluată și condusă manual a fost închisă `COMPLETED`, cu exact un
  settle și un review pentru cursa țintă, revenue total 9 335 SDA (inclusiv cursele AI terminale din
  aceeași sesiune), rating 5, `historyScans: 0` înainte și după panoul `Curse`. Capturile sunt
  [01-live-economy.png](screenshots/01-live-economy.png) și
  [02-economy-with-rides-panel.png](screenshots/02-economy-with-rides-panel.png).

## Comenzi

```powershell
npm run typecheck
npm run economy:live
npm run economy:live -- --check
npm run economy:live:probe
npm test
```

## Limite

Ferestrele 088 de suprimare a artefactelor și secundele blocate 137 nu sunt încă montate live în
266; review-ul folosește confortul real 139, dar raportează acei termeni ca 0. Persistarea economiei
după reload rămâne 278. Cursele închise chiar de resetul 265 cu `SCENARIO_RESET` nu mai sunt vizibile
ca `RideRecord` terminal și nu sunt decontate. Raportul nu este o măsurătoare FPS/GPU/hardware și nu
înlocuiește gate-ul 287.
