# 266 — economia live: dovezi

Dovezile implementării `266-live-economy-composition-v1` peste contractele reale 061/265, 028/088/137
și economia neschimbată 209.

## Ce s-a probat

- **Raport determinist:** [report.json](report.json) și [report.md](report.md), produse de
  `npm run economy:live` pe fixture-ul real de 24 taxiuri și 20 civili, seed 262, dwell 24 tick-uri.
  63/63 verificări.
- **Curse terminale:** `COMPLETED` încasează tariful complet o singură dată (553 SDA pe traseul
  fixture-ului), `FAILED` rambursează integral și nu inventează review, `CANCELLED` fără pasager
  rambursează integral, `CANCELLED` cu pasager păstrează exact taxa de serviciu de 30%.
- **Review:** un review 0–5 per cursă evaluabilă, cu motive din vocabularul închis 209; cursa
  completă primește rating 5 și motivele `EFFICIENT_DELIVERY`, `ON_TIME`, `SMOOTH_DRIVE`.
- **Incident 028 real:** un episode 028 real produce incidentul la tick 146 cu impuls 4 400 N·s.
  Review-ul aceleiași curse deterministe primește `COLLISION`, `penalties.incident = 1`,
  `evidence.impacts = 1`, `peakImpulseNs = 4 400`, iar ratingul scade 5 → 4. Fereastra 088 reală
  (evaluată de `createArtifactFilter`) exclude 4 eșantioane și taie trace-ul de confort de la 14 la
  10 intervale, dar impactul rămâne în review.
- **Blocaj 137 real:** serviciul 137 real acceptă un `BLOCKED_INTERVAL` de 90 s și raportează exact
  acea valoare; economia o atașează cursei evaluate, review-ul primește `BLOCKED_ROUTE`,
  `penalties.incident = 0.5`, `evidence.blockedSeconds = 90`, iar ratingul scade 5 → 4. Contorul
  sesiunii raportează 90 s.
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
- **Browser:** [browser.json](browser.json) și [browser.md](browser.md) păstrează proba reală pe
  Chromium 157 (WEBGL2, 1440×900), 19/19 verificări: o cursă preluată și condusă manual a fost
  închisă `COMPLETED`, cu exact un settle și un review pentru cursa țintă, revenue 9 335 SDA,
  `historyScans: 0` înainte și după panoul `Curse` (citirea panoului s-a făcut cu shell-ul în pauză,
  ca un settle AI real să nu fie confundat cu o scriere a panoului). Contoarele 028/088/137 sunt 0 în
  lumea live, fiindcă owner-ii lor live nu sunt încă montați; secțiunea „Telemetry limits” din
  [browser.md](browser.md) marchează explicit `NOT_RUN` și trimite la raportul determinist.

## Comenzi

```powershell
npm run typecheck
npm run economy:live
npm run economy:live -- --check
npm run economy:live:probe
npm test
```

## Limite

Owner-ii live ai 028 (fizica Rapier), 088 (filtrarea telemetriei) și 137 (blocajele 065) nu sunt
încă montați în compunerea de browser a V1 (272/282); proba de browser nu poate produce un incident
sau un blocaj real în lumea live și raportează contoarele lor ca 0. Lanțul real este probat
determinist în raport, cu owner-ii reali 028/088/137. Compunerea consumă deja porturile lor, iar
cadrul 058 `blocked` este numărat live cât timp pasagerul este la bord. Persistarea economiei după
reload rămâne 278. Cursele închise chiar de resetul 265 cu `SCENARIO_RESET` nu mai sunt vizibile ca
`RideRecord` terminal și nu sunt decontate. Raportul nu este o măsurătoare FPS/GPU/hardware și nu
înlocuiește gate-ul 287.
