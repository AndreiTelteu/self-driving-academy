# Dovezi 263 — selectarea live a oricărui taxi sau civil

Status local la 26 noiembrie 2026. Nu este o declarație de PBI Done; mutarea în Done și integrarea
aparțin orchestratorului.

## Comenzi verificate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS (453 fișiere TypeScript) |
| `npm test` | PASS — 3601 teste, 3587 pass, 14 skipped, 0 fail |
| `npm run build` | PASS (avertismentul Vite de chunk >500 kB rămâne existent) |
| `npm run docs:check -- --check` | PASS |
| `npm run composition:report -- --check` | PASS |
| `npm run fleet:selection:probe` | **NOT_RUN** — Playwright nu este instalat în checkout |

## Dovezi structurale

- `tests/app/live-fleet-selection.test.ts` (5 teste): 58 de vehicule listate/hartă, click care mută
  doar camera, preluarea unui actor 058 fără deplasare de poziție, ruta păstrată la eliberare,
  taxiul parcat preluat și reluat pe AUTO, un singur scaun `PLAYER`, refuz explicit `L`.
- `tests/ui/fleet-selection.test.ts` (6 teste): parser strict, filtre cu ținta camerei și scaunul
  `PLAYER` fixate, click doar pe cameră, preluare separată, auto-închidere după acțiune, Tab/Escape,
  plafonul de 10 Hz cu bypass, zero listeners globali și markerii 076.
- `tests/ui/game-shell-host.test.ts`: butonul `Flotă` al gazdei shell-ului.

## Probă de browser

[browser.json](browser.json) și [report.md](report.md) sunt generate de
`npm run fleet:selection:probe`. Rezultatul este `NOT_RUN` cu motivul exact „Playwright is not
installed in this checkout”; nicio probă de browser nu este pretinsă.

## Limite

- LEARNING (`L`) este refuzat explicit până la PBI 271; nu este simulat.
- Harta completă/minimapa HUD rămân la 281; acest panou refolosește geometria 032/033 și markerele 076.
- Fizica rămâne adaptorul cinematic al compunerii; Rapier este 282.
- Costul UI este verificat structural prin numărul de scrieri/actualizări, nu ca FPS/GPU.
