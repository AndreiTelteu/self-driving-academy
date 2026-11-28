# 281 — minimapa live și HUD-ul complet

Generat de `npm run minimap:hud`. Contract: `281-live-minimap-v1`.
Status: **PASS** (36/36 verificări).

## Contract

| Element | Valoare |
| --- | --- |
| Straturi | 074 minimap + 076 selection + 281 incidents |
| Rânduri HUD | Viteză, Mod, Taxi, Sesiune, Etapă, Obiectiv, Stare, Rută, ETA, Progres, Serviciu |
| Frecvență | 10 Hz |
| Sesiuni | Academia, Haos |
| Incidente | 065 COLLISION_DAMAGE / DAMAGED at the current authoritative position |

## Scenarii deterministe

| Scenariu | Rută / benzi | Markeri | Incidente | Viteză | Sesiune | Obiectiv | Stare | ETA |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| ruta live + vehicul selectat | READY / 4 | 23 (20 T / 3 C) | 1 | 29 km/h | Academia | Du-te la pasagerul din sz:0-0 | În desfășurare | ~52 s |
| fără poziție și fără cursă | READY / 4 | 23 (20 T / 3 C) | 0 | — km/h | session:065 | Fără obiectiv | Fără cursă | Fără estimare |

## Layout

| Breakpoint | Regiune | Viewport efectiv | HUD / minimapă (px) | Suprapuneri | Esențiale | Font minim | Legibil |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 1280×720 | 352 / 240 | 0 | 5 | 12 | true |
| 1920x1080 | LARGE | 1920×1080 | 352 / 240 | 0 | 5 | 12 | true |
| zoom-150 | COMPACT | 853.33×480 | 240 / 160 | 0 | 5 | 18 | true |

## Verificări

| Verificare | Rezultat | Așteptat | Actual | Detaliu |
| --- | --- | --- | --- | --- |
| live-version | PASS | 281-live-minimap-v1 | 281-live-minimap-v1 | the live composition mounts 074/076/281 |
| route-ready | PASS | READY | READY | the minimap draws the certified route |
| route-lanes | PASS | 4 | 4 | exactly the 064 route lane count |
| route-points | PASS | true | true | the route has projected geometry |
| markers-all | PASS | 23 | 23 | all real taxis and civilians from the registry |
| markers-taxis | PASS | 20 | 20 | real taxi markers |
| markers-civilians | PASS | 3 | 3 | real civilian markers |
| incidents | PASS | 1 | 1 | one real 065 collision marker |
| incident-identity | PASS | 281:report:collision | 281:report:collision | the incident keeps the 065 factId |
| selected-vehicle | PASS | id-v1:7:vehicle20:city:fleet-065:fleet4:TAXI4:0002 | id-v1:7:vehicle20:city:fleet-065:fleet4:TAXI4:0002 | the followed vehicle is the selected taxi |
| hud-session | PASS | Academia | Academia | the HUD shows the real session kind |
| hud-objective | PASS | Du-te la pasagerul din sz:0-0 | Du-te la pasagerul din sz:0-0 | the HUD objective comes from the real ride zones |
| hud-stance | PASS | În desfășurare | În desfășurare | the HUD shows the real ride state |
| hud-mode | PASS | Conduce AI-ul | Conduce AI-ul | the HUD mode is the accepted AUTO mode |
| marker-identity-stable | PASS | true | true | a moved vehicle reuses the same marker node |
| click-selection | PASS | id-v1:7:vehicle20:city:fleet-065:fleet4:TAXI4:0002 | id-v1:7:vehicle20:city:fleet-065:fleet4:TAXI4:0002 | the marker click emits the camera-only intention |
| no-position-explicit | PASS | MISSING | MISSING | a missing position stays null, not zero |
| no-invented-speed | PASS | — km/h | — km/h | a missing speed is a dash, not 0 km/h |
| no-invented-eta | PASS | Fără estimare | Fără estimare | a missing ride has no ETA |
| no-invented-progress | PASS | — | — | a missing ride has no progress |
| empty-session | PASS | session:065 | session:065 | an unknown session kind shows the real id |
| empty-stance | PASS | Fără cursă | Fără cursă | the HUD says there is no ride |
| position-state-attr | PASS | MISSING | MISSING | the minimap exposes the explicit position state |
| rate-map | PASS | true | true | 1 dynamic paints in 1 s |
| rate-selection | PASS | true | true | 1 selection updates in 1 s |
| rate-incidents | PASS | true | true | 1 incident updates in 1 s |
| no-global-listeners | PASS | 0 | 0 | the overlay installs no global key listener |
| layout-1280x720-overlap | PASS | 0 | 0 | no critical overlap |
| layout-1280x720-essentials | PASS | 5 | 5 | all five essential controls stay visible |
| layout-1280x720-font | PASS | true | true | 12 CSS px at the requested zoom |
| layout-1920x1080-overlap | PASS | 0 | 0 | no critical overlap |
| layout-1920x1080-essentials | PASS | 5 | 5 | all five essential controls stay visible |
| layout-1920x1080-font | PASS | true | true | 12 CSS px at the requested zoom |
| layout-zoom-150-overlap | PASS | 0 | 0 | no critical overlap |
| layout-zoom-150-essentials | PASS | 5 | 5 | all five essential controls stay visible |
| layout-zoom-150-font | PASS | true | true | 18 CSS px at the requested zoom |

## Limite

- Raportul este determinist și nu măsoară FPS, GPU sau hardware; proba de browser este separată.
- Incidentele live provin exclusiv din 065; buildul curent nu are încă un producător 028/029 montat, deci
  în joc pot apărea zero incidente până când acel owner publică un fapt real.
- Pozițiile vehiculelor din raport sunt citiri de fixture pe benzile reale 032/033, nu un cadru live.
