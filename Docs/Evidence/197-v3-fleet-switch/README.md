# 197 — schimbare rapidă taxi și revenire la mers

Dovezile PBI 197 pentru contractul `197-fleet-switch-v1` din
[`src/character/fleet-switch.ts`](../../../src/character/fleet-switch.ts).

## Ce s-a livrat

- **FOCUS** (`decideFleetFocus`) — taxiul selectat din listă devine ținta camerei. Autoritatea 193 este
  copiată neschimbată, corpul personajului nu este mutat (biți IEEE-754 identici) și numărul de
  entități rămâne același. FOCUS nu are regulă de distanță: un taxi la 200 m este o țintă validă.
  Camera urmează noul `entityId` cu tranziția existentă de 18 tick-uri din 194.
- **TAKE** (`decideFleetTake`) — preluare reală cu regulile 195/196. De pe jos este exact intrarea 195;
  dintr-o altă mașină este ieșirea validă 196 urmată de intrarea 195, compuse **atomic**. Dacă intrarea
  este refuzată, ieșirea este raportată dar nu aplicată. Un taxi distant este refuzat de regula reală
  de atingere a lui 195 (`TAKE_REFUSED` / `OUT_OF_RANGE`).
- **RETURN** (`decideFleetReturn`) — ieșirea validă 196 eliberează mașina în `AUTO` cu ruta de dinainte
  de preluare, apoi corpul este restaurat: poziția dinainte de preluare dacă este încă fizic validă
  (bit-identic), altfel punctul valid al ieșirii 196. Un zid construit între timp peste poziția veche
  este detectat și nu este traversat.
- **Proiecția UI** (`fleetSwitchProjection`) — entitatea controlată (`CHARACTER:<id>` /
  `VEHICLE:<id>`), modul cu sursa lui, entitatea urmărită de cameră, steagul de divergență și motivul
  `FOCUS`. `validateFleetSwitchProjection` refuză proiecțiile incoerente cu
  `INCONSISTENT_PROJECTION`.
- **Stare serializabilă** — `fleetSwitchSnapshot` / `parseFleetSwitchState`: autoritate, focus, corp
  suspendat, jurnale de intrare/ieșire, ultima comandă și contoare, reluabile strict pentru 200.
- **Un singur script nou în `package.json`**: `fleet:switch` (ultima intrare din `scripts`), cu
  `--check`.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0 |
| `npm run format:check` | „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS |
| `npm run check:parameter-catalog` | PASS |
| `npm test` | 3362/3362 pass, 0 fail (13 teste noi în `tests/character/fleet-switch*.test.ts`) |
| `node --import ./scripts/register-typescript.mjs --test tests/character/fleet-switch.test.ts` | 12/12 pass |
| `node --import ./scripts/register-typescript.mjs --test tests/character/fleet-switch-report.test.ts` | 1/1 pass |
| `npm run fleet:switch` | 12/12 scenarii, FOCUS/PASS, TAKE/PASS, RETURN/PASS, chain/PASS, projection/PASS, overall PASS |
| `npm run fleet:switch -- --check` | „Fleet switch report is current” pentru `report.json` și `report.md` |

Numerele din raportul determinist:

- 12/12 scenarii trecute; FOCUS 200 m cu **0 m** mișcați de corp și entități **2 → 2**.
- Cameră: tranziție **18/18** cadre la FOCUS, **0** cadre la TAKE (aceeași țintă), **18/18** la RETURN.
- Revenire: ramura `resume` cu biți identici; ramura `wall` cu `CLEARANCE` pe punctul vechi, walker
  192 refuzându-l cu `WALK_START_BLOCKED` și acceptând punctul de ieșire cu **0,05 m** liber.
- Proiecție: **4** cazuri valide, **8** refuzate cu `INCONSISTENT_PROJECTION`.
- Determinism: 2 rulări identice, SHA-256 al raportului
  `720753874ba6c1bc115c4ef64b52c2793ceea59cc0d3754e0a044f185226a936`.
- Referințe reale: harta `neighbourhood-compact-v1`, 923 elemente de layout, 313 suprafețe de mers,
  86 solide, rază de preluare 0,89 m (195), collider sedan 0,85 × 2,00 m (022/145).

## Fișiere atinse

- `src/character/fleet-switch.ts` (nou) — contractul.
- `src/character/index.ts` — export la finalul fișierului.
- `tests/character/fleet-switch-suite.ts` (nou) — suita deterministă și raportul.
- `tests/character/fleet-switch.test.ts` (nou) — 12 teste de contract.
- `tests/character/fleet-switch-report.test.ts` (nou) — testul raportului.
- `scripts/run-v3-fleet-switch-report.mjs` (nou) — scriptul `fleet:switch`.
- `package.json` — o singură intrare nouă, `fleet:switch`, ultima din `scripts`.
- `Docs/20-extensii-si-mers-pe-jos.md` — secțiunea 197 la final.
- `Docs/Evidence/197-v3-fleet-switch/{report.json,report.md,README.md}`.
- `PBI/Done/197-walking_fleet_jump.md` — mutat fizic din `In Progress`.

## Cum se citește raportul

- `report.json` este sursa de adevăr pentru cifre; `report.md` este transcrierea lui lizibilă.
- Tabelul de scenarii leagă fiecare comandă de autoritatea rezultată, ținta camerei, numărul de
  entități, dacă personajul s-a mutat și verdict.
- Secțiunea FOCUS arată biții poziției și cadrele tranziției; secțiunea lanț arată FOCUS → TAKE →
  RETURN fără stare intermediară inconsistentă; secțiunea de revenire arată ambele ramuri, cu
  rezultatul walker-ului pe punctul vechi și pe punctul de ieșire.

## Limitări

- Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri; compunerea
  (camera 194, input 066, vehicule 024) aplică cererile returnate în tick-ul curent.
- FOCUS nu are regulă de distanță; „aproape” rămâne exclusiv o regulă a TAKE, prin 195.
- TAKE dintr-o mașină compune 196 + 195 în același tick; dacă intrarea e refuzată, ieșirea nu este
  aplicată, dar este raportată pentru diagnostic.
- Poziția de revenire este corpul suspendat la preluare, nu o reconstrucție pas cu pas; contractul nu
  mută corpul prin lume.
- Proiecția raportează `MANUAL` pentru personaj (193 îl conduce manual); etichetele vizuale rămân la UI.
- O singură comandă de flotă pe tick (`DOUBLE_SWITCH_REFUSED`).
- Registrul 068 scrie doar `tick`, `controlMode` și `appliedProfileVersion`; mașina eliberată de 196
  este returnată ca date și trebuie aplicată de proprietarul 061/044/068.
- Proba este deterministă și headless; feel-ul saltului de cameră și validarea în browser rămân la
  integrarea ulterioară.
