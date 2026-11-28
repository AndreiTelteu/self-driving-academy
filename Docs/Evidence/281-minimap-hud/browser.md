# 281 — proba de browser a minimapei și HUD-ului

Generată de `npm run minimap:hud:probe` pe 2026-11-28T01:08:08.121Z; Chromium 157.0.8103.51,
backend WEBGL2, viewport 1280x720 → 1920x1080 → 853x480 (zoom 150%).

Secvența reală: start → minimapa live cu rută 064 → click pe marker (doar camera) → HUD complet →
fapt 065 `COLLISION_DAMAGE` injectat prin portul de probă → măsurătoare 5–10 Hz → capturi la
1280×720, 1920×1080 și zoom 150% (~853×480 efectiv).

## Măsurători

| Măsurătoare | Valoare |
| --- | ---: |
| Marker vehicule | 58 (25 taxi / 33 civil) |
| Markeri pickup/dropoff | 1 / 1 |
| Benzi de rută | 2 |
| Incidente (probe 065) | 1 |
| Actualizări hartă | 19 (9.22 Hz) |
| Actualizări HUD | 19 (9.22 Hz) |
| Scrieri selecție | 19 |
| Scrieri incidente | 0 |
| Ascultători globali | 0 |
| Suprapuneri 1280×720 / 1920×1080 / zoom | 0 / 0 / 0 |

Capturi: [screenshots/01-1280x720.png](screenshots/01-1280x720.png), [screenshots/02-1920x1080.png](screenshots/02-1920x1080.png), [screenshots/03-zoom-150.png](screenshots/03-zoom-150.png).

## Verificări

- `minimap-mounted`: PASS — root hidden false, canvas 240×240
- `canvases-painted`: PASS — 7680 static / 136 dynamic non-transparent pixels
- `marker-click-camera-only`: PASS — camera id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0003, authority CHARACTER:player-character, mode AUTO
- `route-ready`: PASS — READY, 2 lanes, ride id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0003
- `pickup-dropoff-markers`: PASS — P sz:2-3 / D sz:3-2
- `fleet-markers`: PASS — 58 markeri, 58 creați
- `no-global-listeners`: PASS — 0 listeners globali
- `click-restores-canvas-focus`: PASS — focus CANVAS.game-canvas
- `hud-complete`: PASS — 7 km/h · AConduce AI-ul · Academia · Du-te la pasagerul din sz:2-3 · În desfășurare
- `hud-session`: PASS — session Academia
- `hud-objective-route`: PASS — objective Du-te la pasagerul din sz:2-3, route Rută: 2 benzi · 0% · 347 m
- `hud-ride-state`: PASS — stance În desfășurare, stage Spre pasager
- `update-rate-5-10hz`: PASS — 19 actualizări în 2.06 s = 9.22 Hz
- `hud-update-rate`: PASS — 19 actualizări HUD în 2.06 s = 9.22 Hz
- `incident-marker`: PASS — incident probe-281:collision:id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0001
- `layout-01-1280x720-inside`: PASS — HUD true, minimap true
- `layout-01-1280x720-no-overlap`: PASS — HUD/minimap/game-hud/shell/economy overlaps 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
- `layout-01-1280x720-font`: PASS — HUD 15.2 px, minimap 12.8 px
- `layout-02-1920x1080-inside`: PASS — HUD true, minimap true
- `layout-02-1920x1080-no-overlap`: PASS — HUD/minimap/game-hud/shell/economy overlaps 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
- `layout-02-1920x1080-font`: PASS — HUD 16 px, minimap 13.6 px
- `layout-03-zoom-150-inside`: PASS — HUD true, minimap true
- `layout-03-zoom-150-no-overlap`: PASS — HUD/minimap/game-hud/shell/economy overlaps 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
- `layout-03-zoom-150-font`: PASS — HUD 13.6 px, minimap 12 px
- `no-page-errors`: PASS — 0 page errors
- `no-console-errors`: PASS — 0 console errors

## Limitări

- Proba este locală și provizorie; nu măsoară FPS, GPU sau hardware și nu înlocuiește un playtest uman.
- Incidentul din captură este un fapt 065 real injectat prin portul de probă; buildul nu are încă un producător 028/029 live, deci fără probă pot exista zero incidente.
- Breakpoint-ul „zoom 150%” este emulat prin viewport-ul CSS efectiv ~853×480, exact aritmetica media query-urilor documentată de 084.
