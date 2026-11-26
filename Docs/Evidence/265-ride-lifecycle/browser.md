# 265 — proba de browser a ciclului de cursă

Generată de `npm run ride:live:lifecycle:probe`; Chromium 157.0.8103.51, backend WEBGL2,
viewport 1440x900, tick 63–10567.

Secvența reală: start → asignare 060 → un taxi revendicat conduce singur ruta 041 de pickup, oprește
în zona 032 pentru dwell, ia pasagerul, conduce ruta de dropoff, oprește din nou și încheie
`COMPLETED` cu o singură eliberare → al doilea taxi revendicat este preluat de jucător, cursa
supraviețuiește, este condus manual la ancore și se încheie tot `COMPLETED` → un alt taxi revendicat
devine `BLOCKED` prin portul real de sănătate → `FAILED / TAXI_BLOCKED` cu o singură eliberare.

Cursă AUTO: id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0005 (id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0012), pickup sz:1-1 → dropoff
sz:1-0, boarding 1898, completion 6740,
dwell 180/180, rute
2/6 benzi, control AUTO.
Cursă manuală: id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0000 (id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0003), pickup sz:2-3 → dropoff
sz:3-2, boarding 2344, completion 10519.
Cursă eșuată: id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0035:r0000 (id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0012), motiv TAXI_BLOCKED.

Capturi: [screenshots/01-auto-pickup.png](screenshots/01-auto-pickup.png), [screenshots/02-auto-onboard.png](screenshots/02-auto-onboard.png), [screenshots/03-auto-dropoff.png](screenshots/03-auto-dropoff.png), [screenshots/04-auto-completed.png](screenshots/04-auto-completed.png), [screenshots/05-pickup.png](screenshots/05-pickup.png), [screenshots/06-onboard.png](screenshots/06-onboard.png), [screenshots/07-dropoff.png](screenshots/07-dropoff.png), [screenshots/08-completed.png](screenshots/08-completed.png), [screenshots/09-failed.png](screenshots/09-failed.png), [screenshots/10-panel.png](screenshots/10-panel.png).

- `auto-route-assigned`: PASS — route sz:1-1, control AUTO
- `auto-route-matches-pickup`: PASS — actor lane:21W0,lane:11W0
- `auto-pickup-hold`: PASS — state PICKUP, remaining 0 m, stopped true
- `auto-pickup-dwell`: PASS — required 180, observed 4, boarding null
- `auto-pickup-control`: PASS — control AUTO
- `auto-pickup-path`: PASS — pickup lanes 2
- `auto-trip-path`: PASS — actor lane:11W0,lane:11N0,lane:12E1,lane:21S1,lane:20S1,lane:10W0
- `auto-passenger-onboard`: PASS — phase ONBOARD, occupancy 1
- `auto-pickup-dwell-complete`: PASS — observed 180, boarding 1898
- `auto-dropoff-hold`: PASS — state DROPOFF, remaining 0 m
- `auto-ride-completed`: PASS — state COMPLETED, terminal true
- `auto-completion-release`: PASS — release COMPLETED, claim removed
- `auto-passenger-hidden`: PASS — phase NONE, reset true
- `auto-dropoff-dwell-complete`: PASS — observed 180
- `auto-actor-released`: PASS — the terminal ride cleared the 058 service route
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

Limite: cursa AUTO folosește execuția reală 058/041, fără override de poziție; camera este mutată pe
taxiul AUTO doar pentru capturi. Proba manuală folosește tastatura reală și poziția autoritară a
compunerii; nu înlocuiește un playtest uman. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
