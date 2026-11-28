# Evidence 281 — minimapa live și HUD-ul complet

PBI 281 montează în joc contractele existente 074 (minimapă), 076 (selectarea prin hartă) și 073
(HUD), plus stratul de incidente 065. Nu există o a doua simulare, un al doilea ledger, o a doua
hartă sau o cameră Babylon suplimentară.

## Ce a fost livrat

- `src/ui/minimap.ts` — opțiunea `markerOverlay` creează un singur `.minimap__map` peste care stau
  076 și incidentele; `getMapHost`, `getTransform`, `getView` expun exact aceeași cutie.
- `src/ui/minimap-live.ts` — `281-live-minimap-v1` compune 074 + 076 + incidente pe un singur update.
- `src/ui/minimap-incidents.ts` — contract strict, proiecție și adaptor DOM fără listeneri pentru
  incidentele `COLLISION_DAMAGE`; identitatea stabilă este `factId`-ul 065.
- `src/app/minimap.ts` — `readMinimapIncidents` citește 065 real; slotul de prezentare 9998/9999
  permite afișarea unei mașini din compunere care nu este în registrul 057.
- `src/ui/taxi-hud-format.ts`, `src/ui/taxi-hud.ts` — sesiunea 261 și starea explicită a cursei.
- `src/main.ts` — montare, 10 Hz pe ceas de perete, click doar pe cameră, focus înapoi pe canvas și
  portul de probă 065.
- `src/style.css`, `src/ui/game-shell-host.ts`, `src/ui/live-economy-hud.ts` — bara shell-ului în
  banda centrală, economia live sub HUD și `[hidden]` real pentru minimapă.
- `src/ui/responsive-layout.ts` — rezerva HUD standard/large 24rem pentru HUD-ul complet.
- `tests/ui/minimap-live.test.ts`, `tests/app/minimap-hud.test.ts` — 7 teste noi.
- `tests/app/minimap-hud-report.ts`, `scripts/run-minimap-hud-report.mjs`, `npm run minimap:hud`.
- `scripts/run-live-minimap-hud-probe.mjs`, `npm run minimap:hud:probe`.

## Legături reale

| Valoare | Sursă reală | Regulă |
| --- | --- | --- |
| Drumuri, intersecții, mișcări | 032 `RoadMap`, 033 `LaneGraph` | geometrie statică, desenată o dată |
| Rută | 064 `EtaSnapshot.routeLaneIds` | `READY` numai pentru cursa/taxiul/etapa/legul potrivit |
| Taxi/civil selectat | 057 registru + cadrul 263 | identitate `vehicleId`; slot 9998/9999 doar pentru mașinile parcate |
| Ridicare/predare | 061 `pickupZoneId`/`dropoffZoneId` | ancorele reale 032; lipsa zonei nu inventează marker |
| Incidente | 065 `DAMAGED` + `COLLISION_DAMAGE` | poziția curentă a taxiului; identitate `factId`; 065 absent = `UNAVAILABLE` |
| Viteză | 005/024 | `null` afișat „—”, niciodată `0` inventat |
| Sesiune | 261 | `ACADEMY`/`CHAOS`; tip necunoscut afișează ID-ul real |
| Stare cursă | 061 | `Fără cursă`/`În desfășurare`/`Încheiată`/`Eșuată`/`Anulată` |

## Raport determinist

```powershell
npm run minimap:hud
npm run minimap:hud -- --check
```

Rezultat local: **36/36 verificări**, 2 scenarii, 3 layout-uri. Raportul acoperă ruta 064 (4 benzi,
33 puncte), 23 de markeri (20 taxi + 3 civil în fixture), un incident 065 cu `factId` stabil, click
care emite o singură intenție, starea fără poziție/cursă (`MISSING`, `—`, „Fără estimare”), plafonul
de 10 Hz și cele trei breakpoint-uri fără suprapuneri critice.

Fișiere: [report.json](report.json), [report.md](report.md).

## Proba de browser

```powershell
$env:PLAYWRIGHT_MODULE = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\index.mjs"
npm run minimap:hud:probe
```

Rezultat local: **26/26 verificări**, Chrome headed (WebGL2), 58 de markeri (25 taxi + 33 civili),
P/D reale, 2 benzi de rută, un incident injectat prin portul 065 de probă, 9.22 Hz actualizări de
hartă, 9.22 Hz HUD, 0 ascultători globali, 0 suprapuneri la 1280×720, 1920×1080 și 853×480 (zoom
150%). Capturi: [01-1280x720](screenshots/01-1280x720.png),
[02-1920x1080](screenshots/02-1920x1080.png), [03-zoom-150](screenshots/03-zoom-150.png).

Fișiere: [browser.json](browser.json), [browser.md](browser.md).

## Limitări

- Buildul curent nu are încă un producător live 028/029 de incidente; proba injectează un fapt 065
  real prin portul de probă și marchează explicit acest lucru. Fără probă, harta poate arăta zero
  incidente.
- Proba este locală, în Chrome, și nu măsoară FPS, GPU sau hardware.
- Breakpoint-ul „zoom 150%” este emulat prin viewport-ul CSS efectiv ~853×480, exact aritmetica 084.
- Panoul de tutorial 275 poate acoperi statusul economic secundar cât timp este deschis; HUD-ul,
  minimapa și bara shell-ului rămân neacoperite.
