# 264 — proba de browser a curselor live

Generată de `npm run ride:live:probe`; Chromium 157.0.8103.51, backend WEBGL2,
viewport 1440x900, tick 85–102.

Secvența reală: start → cereri 059 vizibile în panoul `Curse` → taxiuri alocate 060 → preluarea
explicită a unui taxi alocat din panoul `Flotă` (263) → eliberare `PLAYER_TAKEOVER` și excludere.
Capturi: [screenshots/01-rides-panel.png](screenshots/01-rides-panel.png), [screenshots/02-player-takeover.png](screenshots/02-player-takeover.png).

- `rides-port-present`: PASS — shell mounts the 264 rides port
- `panel-surface`: PASS — panel surface; paused true (panel)
- `fleet-24-taxis`: PASS — 24 live taxis
- `requests-visible`: PASS — 64 scenario requests
- `real-zones`: PASS — pickup/dropoff use real 032 service zones
- `assignments-visible`: PASS — 4 active claims
- `both-legs-visible`: PASS — each claim carries real pickup and trip lanes
- `unique-claims`: PASS — 4 unique request/taxi claims
- `queue-bounded`: PASS — 0/64 pending
- `panel-rows`: PASS — 64 request rows, 4 assignment rows
- `player-release`: PASS — 1 PLAYER_TAKEOVER release(s)
- `player-excluded`: PASS — id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0003 is player-driven and unassigned
- `no-page-errors`: PASS — 0 page errors
- `no-console-errors`: PASS — 0 console errors

Limite: proba este locală și provizorie; pickup/dropoff fizic, pasagerii și ETA rămân PBI 265.
Nu măsoară FPS/GPU și nu înlocuiește un playtest uman.
