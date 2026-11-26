# 265 — proba de browser a ciclului de cursă

Generată de `npm run ride:live:lifecycle:probe`; Chromium 157.0.8103.51, backend WEBGL2,
viewport 1440x900, tick 66–10585.

Secvența reală: start → asignare 060 → preluarea taxiului revendicat (cursa supraviețuiește) → condus
manual la ancora 032 de pickup → oprire pentru dwell → pasager 147 la bord → condus la ancora de
dropoff → oprire pentru dwell → `COMPLETED` cu o singură eliberare → un alt taxi revendicat devine
`BLOCKED` prin portul real de sănătate → `FAILED / TAXI_BLOCKED` cu o singură eliberare.

Cursă completă: id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0000 (id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0003), pickup sz:2-3 → dropoff
sz:3-2, boarding 2359, completion 10552.
Cursă eșuată: id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0001 (id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0006), motiv TAXI_BLOCKED.

Capturi: [screenshots/01-pickup.png](screenshots/01-pickup.png), [screenshots/02-onboard.png](screenshots/02-onboard.png), [screenshots/03-dropoff.png](screenshots/03-dropoff.png), [screenshots/04-completed.png](screenshots/04-completed.png), [screenshots/05-failed.png](screenshots/05-failed.png), [screenshots/06-panel.png](screenshots/06-panel.png).

- `ride-survives-takeover`: PASS — the claimed taxi became MANUAL and kept its 061 ride and 060 claim
- `player-claim-kept`: PASS — the assignment is still present for the player-driven taxi
- `rides-port-present`: PASS — shell mounts the 265 rides port
- `pickup-zone-arrival`: PASS — ride state PICKUP; pickup sz:2-3
- `pickup-dwell`: PASS — required dwell 180
- `passenger-boarding-visible`: PASS — passenger phase BOARDING
- `hud-pickup`: PASS — Viteză0km/hMConduci · învățare oprităTaxi#3EtapăLa pasagerObiectivAșteaptă îmbarcarea în sz:2-3Rutăsz:2-3 → sz:3-2ETALa pasagerProgres100% · 0 mServiciuFlux lib
- `hud-pickup-progress`: PASS — the HUD exposes the certified progress at the pickup anchor
- `passenger-onboard`: PASS — phase ONBOARD, occupancy 1
- `passenger-marker-onboard`: PASS — 1 marker(s), visible true
- `hud-trip`: PASS — Viteză0km/hMConduci · învățare oprităTaxi#3EtapăSpre destinațieObiectivDu pasagerul la sz:3-2Rutăsz:2-3 → sz:3-2ETA~1 min 28 sProgres7% · 1.2 kmServiciuFlux lib
- `dropoff-zone-arrival`: PASS — ride state DROPOFF; dropoff sz:3-2
- `passenger-dropping-off`: PASS — passenger phase DROPPING_OFF
- `ride-completed`: PASS — terminal true, reason —
- `completion-release`: PASS — release COMPLETED, claim removed
- `passenger-hidden-after-dropoff`: PASS — phase NONE, reset true
- `hud-after-completion`: PASS — the HUD no longer claims an active trip
- `failure-health-port`: PASS — setTaxiHealth returned BLOCKED
- `failure-terminal`: PASS — state FAILED, reason TAXI_BLOCKED
- `failure-release`: PASS — release FAILED, claim removed
- `failure-single-receipt`: PASS — 1 receipt(s)
- `panel-completed-row`: PASS — the panel shows the completed ride
- `panel-failed-reason`: PASS — the panel shows FAILED and its closed reason
- `no-page-errors`: PASS — 0 page errors
- `no-console-errors`: PASS — 0 console errors

Limite: proba condusă manual folosește tastatura reală și poziția autoritară a compunerii; nu
înlocuiește un playtest uman. Cursa autonomă completă rămâne o limitare explicită (taxiurile AI nu
primesc încă un traseu de cursă în compunere). Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
