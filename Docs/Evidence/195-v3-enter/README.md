# 195 — intrarea în orice mașină din proximitate

Contractul `195-enter-vehicle-v1` este livrat în
[`src/character/enter-vehicle.ts`](../../../src/character/enter-vehicle.ts) și exportat la finalul
lui [`src/character/index.ts`](../../../src/character/index.ts). El decide o singură tranziție de
intrare: primește corpul personajului din 192, mașinile cu amprenta și starea lor completă,
autoritatea curentă din 193 și intenția explicită, iar rezultatul este o acceptare sau un refuz cu
cod închis. Nu are ceas, DOM, Babylon, `Math.random` sau servicii de simulare și nu mută obiectele
primite.

## Cum se decide accesul fizic

- **Ușa** este mijlocul flancului caroseriei (amprenta reală 0,85 × 2,00 m din 022/145), pe partea
  cea mai apropiată a personajului. Distanța se măsoară planar, în X/Z, ca fizica 192.
- **Raza** este `createCharacterAsset().measured.armSpanM / 2` = **0,89 m**: jumătatea anvergurii
  brațelor măsurate pe assetul 191, nu o constantă de gust.
- **Zidul dintre** este testat cu intersecție exactă segment-poligon convex (poligoanele lumii de
  mers 192, plus caroseriile celorlalte mașini). Un solid contează doar dacă se suprapune vertical cu
  corpul, exact regula solverului din 192. Poligonul este închis, deci o linie care doar atinge un
  zid este blocată. Caroseria mașinii țintă este exclusă (ușa e pe flancul ei).
- **Ușa blocată** este prinsă de aceeași funcție: un obstacol sau o altă caroserie care conține
  punctul ușii oprește accesul.

Refuzuri reale, fiecare cu cod: `OUT_OF_RANGE`, `PATH_BLOCKED` (cu `blockerId`), `UNKNOWN_VEHICLE`,
`VEHICLE_OCCUPIED`, `VEHICLE_UNAVAILABLE`, plus `DOUBLE_ENTRY_REFUSED` pentru a doua intrare în
același tick. Vocabularul este închis în `VEHICLE_ENTRY_REFUSAL_CODES`; inputurile malformate aruncă
`INVALID_ENTRY_*`, nu se prefac într-un refuz de acces.

Regulile refuzurilor sunt cele livrate, nu inventate:

- `VEHICLE_OCCUPIED` — 068 ține **un singur scaun de jucător**: cât timp autoritatea 193 este
  `VEHICLE:<id>`, o altă intrare nu este admisă. Nu există noțiunea de al doilea șofer uman.
- `VEHICLE_UNAVAILABLE` — starea de avarie 023 `IMMOBILIZED` (accelerație zero, frână maximă):
  mașina nu poate fi condusă. 068 nu are o misiune care să interzică preluarea, deci nu a fost
  inventată una.
- Taxiul aflat în cursă este **acceptat**: cursa nu este un motiv de acces refuzat.

## Criteriul 2a — o singură autoritate, fără a distruge personajul

Acceptarea întoarce autoritatea 193 `VEHICLE:<vehicleId>` și cererea 194 pentru același tick. Dovada
rulează arbitrajul real:

- 42 de comenzi livrate personajului înainte de tranziție, **0 după**;
- livrarea către personaj după tranziție este refuzată cu `INACTIVE_CONSUMER_REFUSED`;
- a doua livrare din tick este refuzată cu `DOUBLE_DELIVERY_REFUSED`;
- tastele ținute la tranziție rămân neutralizate (`throttle` apăsat înainte nu produce accelerație);
- o tranziție de autoritate;
- entități **2 → 2** (personaj + mașină), corpul personajului păstrat, poziția autoritară
  bit-identică (`405680000000000000000000000000004066166666666666` înainte și după);
- a doua intrare în același tick este `DOUBLE_ENTRY_REFUSED`; fără jurnal, în alt tick, reintrarea
  este `VEHICLE_OCCUPIED` (scaunul este încă ocupat până la eliberarea din 196).

## Criteriul 2b — cursa mașinii rămâne bit-identică

Amprenta `vehicleEntryBits` codifică fiecare număr ca 8 bytes IEEE-754 și fiecare text ca puncte de
cod, în ordine fixă, și exclude **doar** `state.controlMode`. Pentru fiecare acceptare, toate cele
16 câmpuri păstrate sunt identice, iar amprenta înainte este egală cu cea de după:

| Vehicul | Mod | Câmpuri identice | Cursă | Benzi | Progres (m) |
| --- | --- | ---: | --- | ---: | ---: |
| `vehicle:civil-195` | AUTO → MANUAL | 16/16 | — | 0 | 0 |
| `vehicle:taxi-195` | LEARNING → MANUAL | 16/16 | `ride-061-7` | 3 | 412,5 |

Un test dovedește că amprenta este sensibilă: o variație de 1e-12 m în poziție sau progres, o bandă
de rută lipsă, un `rideId` diferit sau o disponibilitate schimbată produc altă amprentă, în timp ce
schimbarea modului nu o schimbă. Contractul își verifică invariantul intern și aruncă
`INVALID_ENTRY_STATE` dacă un bit păstrat s-ar fi schimbat.

## Camera 194 — aceeași autoritate, în același tick

Acceptarea conține cererea 194 exactă (`tick`, `authorityEntityId`, `previousEntityId`). Dovada
pornește camera reală pe personaj și o pașește pe mașină în tick-ul intrării: primul cadru raportează
deja `entityId` al mașinii, tranziția este cea existentă de **18 tick-uri** (17 → 0 tick-uri rămase),
18/18 cadre, o singură tranziție, 0 clonări și 0 scrieri de țintă.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, 0 erori |
| `npm run lint` | exit 0, 0 erori, 0 warnings |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (405 TypeScript files)`, probe negative 6 + 4 + 3, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | **3334 teste, 3334 trecute, 0 eșuate**, 1 suită, 111 677,5 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/character/enter-vehicle.test.ts" "tests/character/enter-vehicle-report.test.ts"` | **11 teste, 11 trecute, 0 eșuate** |
| `npm run enter:report` | **10/10 scenarii PASS**, criteriu 1 PASS, 2a PASS, 2b PASS, cameră PASS, entități 2 → 2, tranziție cameră 18/18, determinism identic, verdict PASS; digest SHA-256 `6af63aee34ce49530e7a250c89c488ed5bfbec06302e429390235736d140ba52` |
| `npm run enter:report -- --check` | `Enter vehicle report is current`, `Enter vehicle markdown is current`, exit 0 |

## Scenarii reale din raport

| Scenariu | Vehicul | Distanță (m) | Acces | Motiv |
| --- | --- | ---: | --- | --- |
| `civil-open` | `vehicle:civil-195` | 0,3000 | ACCEPTED | acces fizic confirmat |
| `taxi-in-ride` | `vehicle:taxi-195` | 0,3000 | ACCEPTED | acces fizic confirmat, cursa păstrată |
| `seat-occupied` | `vehicle:taxi-195` | — | REFUSED | `VEHICLE_OCCUPIED` |
| `same-tick-second-entry` | `vehicle:taxi-195` | — | REFUSED | `DOUBLE_ENTRY_REFUSED` |
| `out-of-range` | `vehicle:far-195` | 3,0150 | REFUSED | `OUT_OF_RANGE` |
| `door-blocked` | `vehicle:civil-195` | 0,3000 | REFUSED | `PATH_BLOCKED` (`hazard:obstacle-01`) |
| `immobilized` | `vehicle:civil-195` | — | REFUSED | `VEHICLE_UNAVAILABLE` |
| `unknown-vehicle` | `vehicle:missing-195` | — | REFUSED | `UNKNOWN_VEHICLE` |
| `vehicle-at-door` | `vehicle:civil-195` | 0,3000 | REFUSED | `PATH_BLOCKED` (`vehicle:vehicle:neighbour-195`) |
| `wall-between` | `vehicle:wall-195` | 0,7071 | REFUSED | `PATH_BLOCKED` (`bld:blk:0-0:0-0`) |

Zidul este un colț real de clădire din harta `neighbourhood-compact-v1`: personajul stă la 0,10 m
veste de fațada de vest, ușa este la 0,10 m sud de fațada de sud, iar segmentul dintre ei trece prin
clădire. Obstacolul este o cutie reală 165 (0,4 × 0,4 × 1,0 m) peste ușă, iar cealaltă caroserie
acoperă ușa din partea opusă.

## Fișiere atinse

- `src/character/enter-vehicle.ts` (nou) și exportul de la finalul `src/character/index.ts`;
- `tests/character/enter-vehicle.test.ts`, `tests/character/enter-vehicle-suite.ts`,
  `tests/character/enter-vehicle-report.test.ts` (noi);
- `scripts/run-v3-enter-report.mjs` (nou) și `package.json` (o intrare nouă, ultima din `scripts`:
  `enter:report`);
- `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final);
- `Docs/Evidence/195-v3-enter/{README.md,report.json,report.md}`.

Nu au fost modificate `src/fleet`, `src/simulation`, `src/vehicles`, `src/input`, `src/ui`,
`src/app`, `src/persistence`, `Docs/11`, `Docs/18` sau bugetele.

## Limitări

- Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri. Compunerea
  (input 066, camera 194, vehiculul 024) aplică decizia în tick-ul curent; integrarea în bucla reală
  a jocului rămâne la compoziție.
- Accesul este planar, ca fizica 192: un portal, o trapă sau o ușă deschisă nu sunt modelate, iar
  verticalitatea contează doar prin suprapunerea solidelor cu corpul.
- Ușa este mijlocul flancului caroseriei, nu un mâner modelat; un vehicul cu ușa în altă poziție ar
  cere un câmp suplimentar de contract.
- „Ocupat” este scaunul unic de jucător din 068, nu un al doilea jucător uman.
- Indisponibilitatea folosește doar regula reală din 023 (`IMMOBILIZED`); nu există o misiune care să
  interzică preluarea.
- Proba este deterministă și headless; feel-ul intrării, animația `enter-vehicle` din 191 și
  validarea în browser rămân la integrarea 195/196.
