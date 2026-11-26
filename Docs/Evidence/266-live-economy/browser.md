# 266 — proba de browser a economiei live

Generată de `npm run economy:live:probe`; Chromium 157.0.8103.51, backend WEBGL2,
viewport 1440x900, tick 10577.

O cursă reală 265 a fost preluată de jucător, condusă la ancora 032 de pickup, lăsată pentru dwell,
condusă la destinație și închisă `COMPLETED`. Economia a produs o singură decontare și un review,
iar HUD-ul live a afișat revenue și rating.

| Metric | Value |
| --- | ---: |
| Ride / taxi | `id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0000` / `id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0003` |
| Completion tick | 10577 |
| Target settlements / reviews | 1 / 1 |
| Session settlements / reviews (AI + player) | 18 / 18 |
| Revenue | 9335 SDA |
| Day revenue | 9335 SDA |
| Rating / reasons | 5 / LATE_ARRIVAL |
| Comfort samples → intervals | 18956 → 18931 |
| historyScans before / after panel | 0 / 0 |
| Economy port | PRESENT |

HUD: `Economie liveZiua simulată d0000 (parțială) · Venit: 9335 SDACurse: 18 (18 finalizate, 0 eșuate, 0 anulate)Rating: 5.00 (18 review-uri)Expunere: 64.0 s · Epoca economică 1 (de la tick 0)Luna simulată m0000 (parțială) · Venit: 9335 SDA · Rating: 5.00 (18 review-uri)Total sesiune: 9335 SDA · 18 curse decontateSettle-uri: 18 · 0 duplicate · 0 respinse · 18 review-uriUltima cursă: COMPLETED · 597 SDA · rating 5`

Capturi: [screenshots/01-live-economy.png](screenshots/01-live-economy.png), [screenshots/02-economy-with-rides-panel.png](screenshots/02-economy-with-rides-panel.png).

- `ride-survives-takeover`: PASS — the player takeover keeps the real 061 ride
- `passenger-onboard`: PASS — boarding tick 2408
- `ride-completed`: PASS — state COMPLETED
- `economy-port`: PASS — port PRESENT
- `settlements-present`: PASS — 18 terminal settlements (AI + player)
- `target-single-settlement`: PASS — 1 settlements for id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0000
- `target-single-review`: PASS — 1 reviews for id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0000
- `revenue`: PASS — 9335 SDA
- `day-revenue`: PASS — 9335 vs 9335
- `target-rating`: PASS — 5
- `history-scans`: PASS — read 0, snapshot 0, kpi 0
- `hud-visible`: PASS — false · Economie liveZiua simulată d0000 (parțială) · Venit: 9335 SDACurse: 18 (18 finalizate, 0 eșuate, 0 anulate)Rating: 5.00 (18 review-uri)Expunere: 64.0 s · Epoca economică 1 (de la t
- `panel-history-scans`: PASS — historyScans 0
- `panel-revenue-stable`: PASS — 9335 vs 9335
- `panel-settlements-stable`: PASS — 18/18
- `economy-in-shell`: PASS — steps 10616
- `no-page-errors`: PASS — 0 page errors
- `no-console-errors`: PASS — 0 console errors

Limite: proba folosește tastatura reală și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287. Persistarea economiei după reload
rămâne 278.
