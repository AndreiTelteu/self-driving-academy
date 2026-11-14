# 192 — controller fizic pentru mers pe jos

Implementarea contractului `192-walker-v1`: deplasare pe sol, coliziuni cu lumea reală și trepte,
peste poziția autoritară deja livrată de 191.

## Ce s-a implementat

| Fișier | Rol |
| --- | --- |
| `src/character/walk-geometry.ts` | Geometrie planară pură: poligoane convexe CCW, apartenență, distanță, penetrare și împingere cerc-contur. |
| `src/character/walk-world.ts` | Lumea de mers ca date: suprafețe cu cotă reală, solide cu cotă de jos/sus și marjă; `createCityWalkWorld(layout)` derivă totul din layout-ul 042. |
| `src/character/walker.ts` | Walker-ul determinist pe tick fix: input → viteză → deplasare pe substep-uri → coliziune → trepte → clip din viteza măsurată → autoritate unică. Include canalele care refuză explicit orice corp auto. |
| `src/character/index.ts`, `src/character/errors.ts` | Exporturile publice și vocabularul închis de erori extins (`INVALID_WALK_INPUT`, `WALK_START_BLOCKED`, `VEHICLE_BODY_WRITE_REFUSED`, `VEHICLE_STATE_WRITE_REFUSED`). |
| `tests/character/walk-world.ts` | Fixturi: orașul real (hartă, bordură, clădire), colliderul real al sedanului (022/145), fixturi de treaptă/prăpastie/obstacol și măsurarea independentă a penetrării. |
| `tests/character/walker-collision.test.ts` | Zid, trotuar, treaptă de 0,14 m, treaptă peste plafon, coborâre, obstacol, contact cu mașina, clip din viteză, start blocat, control negativ al măsurătorii. |
| `tests/character/walker-authority.test.ts` | Criteriul 2 (0 corpuri, vehicul nemutat, înregistrare refuzată) și autoritatea unică (cadru de render bit-identic, al doilea writer inexistent). |
| `tests/character/walker-suite.ts`, `tests/character/walker-report.test.ts` | Raportul determinist și aserțiunile lui. |
| `scripts/run-v3-walker-report.mjs`, `package.json` | Comanda `walker:report` (cu `--check`), ultima intrare din `scripts`. |
| `Docs/20-extensii-si-mers-pe-jos.md` | Secțiunea de contract a mersului, la finalul documentului. |

## Cum funcționează

- **Tick fix 60 Hz, fără ceas.** `step()` cere tick-ul următor; alt tick este refuzat. Viteza țintă
  este viteza nominală a clipului 191 × intensitatea, iar viteza reală se apropie de ea cu 6 m/s² la
  accelerare și 10 m/s² la decelerare.
- **Clip din viteza reală.** Deplasarea efectivă ÷ 1/60 s dă viteza măsurată; sub 0,05 m/s → `idle`,
  până la 1,05 × viteza de mers → `walk`, peste → `run`. Un `RUN` blocat într-un zid produce `idle`.
- **Capsulă din 191.** Rază 0,150 m (jumătatea laturii mari a amprentei 0,300 × 0,260 m) și înălțime
  1,780 m, citite din asset, nu rescrise ca numere.
- **Coliziune.** Substep-uri de cel mult 0,05 m, până la 8 treceri cerc-poligon convex; se aplică
  întotdeauna împingerea cea mai adâncă, deci nu există traversare. Marja este 0,05 m pentru obstacol
  și vehicul, 0 pentru clădiri.
- **Trepte.** Plafonul este bordura reală (0,14 m, `CITY_LAYOUT_DEFAULTS.sidewalkElevationM`). Sub
  plafon se urcă/se coboară cu eveniment `STEP_UP`/`STEP_DOWN`; peste plafon muchia se comportă ca un
  perete și refuzul este raportat (`STEP_REFUSED_ASCENT`/`STEP_REFUSED_DESCENT`), cu înălțimea
  refuzată și plafonul.
- **Criteriul 2.** Walker-ul citește vehiculele ca amprente înghețate (colliderul real 0,85 × 2,00 m
  din 022/145) și nu are nicio cale de creare: `vehicleBodiesCreated` rămâne 0, `registerVehicleBody`
  aruncă `VEHICLE_BODY_WRITE_REFUSED`, `writeVehicleState` aruncă `VEHICLE_STATE_WRITE_REFUSED`.
- **Autoritate unică.** Doar `step` scrie poziția; `renderFrame()` copiază poziția și yaw-ul fără
  aritmetică, iar writer-ul de animație din 191 continuă să refuze scrierea poziției.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (tsc aplicație + teste). |
| `npm run lint` | PASS (`eslint . --max-warnings 0`). |
| `npm run format:check` | PASS („All matched files use Prettier code style!”). |
| `npm run check:architecture` | PASS (402 fișiere TypeScript; sondele negative 6 + 4 + 3 trec). |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”). |
| `npm test` | **3290 teste, 3290 pass, 0 fail** (110,6 s). |
| `node --import ./scripts/register-typescript.mjs --test "tests/character/*.test.ts"` | **40 teste, 40 pass, 0 fail**. |
| `npm run walker:report` | PASS: 8/8 scenarii, penetrare maximă 1,44 × 10⁻¹⁵ m, criteriu 1 PASS, criteriu 2 PASS, autoritate unică PASS, 0 corpuri auto, determinism identic. |
| `npm run walker:report -- --check` | PASS („Walker report is current”, „Walker markdown is current”). |
| `pwsh ./PBI/Validate-Board.ps1 -RequireDone '192'` | `Valid: true`, 235 PBI-uri (To Do 10, In Progress 0, Done 225), 192 în `RequiredDonePaths`. |

## Rezultatele scenariilor (report.json)

Poziția este centrul tălpilor, în metri; penetrarea este măsurată independent de walker.

| Scenariu | Pași | Poziție finală | Distanță | Penetrare max | Clip | Trepte sus/jos/refuz | Verdict |
| --- | ---: | --- | ---: | ---: | --- | --- | --- |
| `wall` | 240 | 34,1189 / 0,1400 / 24,5654 | 1,8500 | 1,44e-15 | idle | 0/0/0 | PASS |
| `sidewalk` | 120 | 92,5966 / 0,1400 / 175,0000 | 2,5966 | 0 | walk | 0/0/0 | PASS |
| `curb-step-up` | 120 | 90,0000 / 0,1400 / 174,1034 | 2,5966 | 0 | walk | 1/0/0 | PASS |
| `curb-step-down` | 120 | 90,0000 / 0,0000 / 177,5966 | 2,5966 | 0 | walk | 0/1/0 | PASS |
| `step-over-ceiling` | 120 | 0 / 0 / 1,8500 | 1,8500 | 0 | idle | 0/0/1 | PASS |
| `drop-over-ceiling` | 120 | 0 / 0,1400 / 1,8500 | 1,8500 | 0 | idle | 0/0/1 | PASS |
| `obstacle` | 180 | 0 / 0 / 2,4000 | 2,4000 | 0 | idle | 0/0/0 | PASS |
| `vehicle-contact` | 180 | 90,0000 / 0,0000 / 0,7500 | 1,7500 | 0 | idle | 0/0/0 | PASS |

Numere de referință: zidul clădirii `bld:blk:0-0:0-0` are fațada la z = 24,7154, iar personajul se
oprește la 24,5654 (exact o rază de 0,15 m). Treapta urcată este chiar bordura de 0,14 m a benzii
`walk:blk:0-0:N`. Treapta refuzată are 0,30 m (peste plafonul de 0,14 m) și este oprită la 1,85 m, cu
0 penetrare. Obstacolul de 0,8 × 0,8 m oprește la 2,40 m (marginea din 2,60 minus rază și marjă).
Sedanul oprește la 1,05 m față de linia mediană (0,15 rază + 0,85 jumătate lățime + 0,05 marjă).

## Dovezile criteriului 2

| Dovadă | Rezultat |
| --- | --- |
| Corpuri auto create de walker | **0** (și 0 după apelurile refuzate) |
| `registerVehicleBody` | refuzat, `VEHICLE_BODY_WRITE_REFUSED` |
| `writeVehicleState` | refuzat, `VEHICLE_STATE_WRITE_REFUSED` |
| Vehicul staționar, 60 tick-uri de mers | biți identici (`40568000…3ffccccccccccccd`) |
| Vehicul mutat de proprietar la z = 4,5 | poziția proprietarului păstrată bit-identic după 120 tick-uri |
| Reacția walker-ului | oprește la 4,5 − 1,05 = 3,45 m, deci a citit noua poziție |
| Cadre de render bit-identice | 120/120 |
| Scrieri de poziție prin animație | 0 (writer-ul 191 refuză cu `AUTHORITY_WRITE_REFUSED`) |

Amprenta deterministă a raportului: `c9d66eca1d3f7b4164537d9113467851b76cd238ae34fc719cf072019d8fa228`
(două rulări identice).

## Limitări

- Coliziunea este planară: cilindru contra poligoanelor convexe cu cotă de sus/jos. Pantele continue,
  rampele line și interioarele nu există în layout-ul 042 și nu sunt simulate.
- Vehiculele sunt citite ca amprente înghețate; nu se simulează împingerea lor de către personaj și
  nici transferul de control (PBI 195).
- Treptele sunt suprafață + plafon; o muchie peste plafon se comportă ca un perete, nu ca o rampă.
- Proba este headless: fără browser, GPU, input uman sau playtest. Reprezentarea vizuală este cea
  livrată de 191; integrarea în scenă și camera aparțin PBI 195.
- `positionWrites` numără doar tick-urile care schimbă efectiv poziția (52 din 120 în proba de
  autoritate), nu fiecare tick.
