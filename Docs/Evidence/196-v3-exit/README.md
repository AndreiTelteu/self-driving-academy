# 196 — ieșirea din mașină și punct valid

Contractul `196-exit-vehicle-v1` este livrat în
[`src/character/exit-vehicle.ts`](../../../src/character/exit-vehicle.ts) și exportat la finalul lui
[`src/character/index.ts`](../../../src/character/index.ts). El decide o singură tranziție de ieșire:
primește mașina ținută de scaunul jucătorului (068), snapshot-ul ei de dinainte de preluare (195),
corpul de mers 191/192, celelalte mașini și lumea de mers 192, iar rezultatul este fie o eliberare
acceptată, fie un refuz cu cod închis. Nu are ceas, DOM, Babylon, `Math.random` sau servicii de
simulare și nu mută obiectele primite.

## Cum se alege punctul de ieșire

- **Ordinea candidaților este fixă**: `LEFT:R0`, `RIGHT:R0`, `REAR:R0`, `FRONT:R0` (flancurile
  caroseriei reale 0,85 × 2,00 m din 022/145, apoi spatele și fața), iar apoi același inel la
  **0,60 m** mai în exterior: `LEFT:R1`…`FRONT:R1`. Planificarea se oprește la primul punct valid,
  deci lista returnată este exact munca făcută.
- **Marja** inelului de contact este `0,05 m`, aceeași marjă de contact cu vehiculul pe care o
  folosește walker-ul 192; centrul candidatului stă la `jumătate caroserie + raza 191 (0,150 m) +
  0,05 m` de axa mașinii.
- **Un punct este valid** dacă amprenta 191 (0,300 × 0,260 m) nu atinge caroseria eliberată, nicio
  altă mașină și niciun solid autorat (clădire sau obstacol, cu marja proprie a solidului), dacă
  suprafața de sub el este cea autorată (nu sub planul hărții) și dacă treapta pe acel sol nu
  depășește bordura reală de 0,14 m din 192.
- **Motivele de refuz per candidat sunt închise**: `SOLID` (cu `blockerId`, inclusiv caroseria
  eliberată), `OTHER_VEHICLE`, `STEP_TOO_HIGH`, `BELOW_MAP`.
- **Când niciun candidat nu e valid**, ieșirea este refuzată cu `NO_VALID_EXIT`, cu toți candidații
  și motivele lor în refuz. Corpul nu este mutat nicăieri: nu există cale de teleportare într-un zid.

Regula mașinii în mișcare este explicită: peste viteza nominală a clipului de mers din 191
(**1,3710 m/s**) ieșirea este refuzată cu `VEHICLE_MOVING`. Sub prag, punctul se calculează din poza
mașinii din același tick. O mașină deja `AUTO`, o autoritate care nu mai ține mașina și o a doua
ieșire în același tick sunt refuzate cu `NOT_CONTROLLED` și `DOUBLE_EXIT_REFUSED`.

## Criteriul 1 — dovada numerică

Pentru fiecare ieșire acceptată, dovada rulează `measurePenetration` din fixtures 192 față de
**fiecare** solid și **fiecare** caroserie din lume:

- penetrarea maximă: **0 m** (fără penetrare);
- marja minimă liberă: **0,0500 m** (peste zero, cu marjă);
- cota punctului minus suprafața autorată: **0 m** (niciodată sub sol).

În plus, fiecare candidat respins pentru un collider este dat walker-ului real 192, care îl refuză cu
`WALK_START_BLOCKED`: **13/13** candidați. Punctul ales este acceptat de `createWalker`, iar poziția
lui autoritară este bit-identică cu punctul de ieșire
(`405680000000000000000000000000004066199999999999`).

Scenariul cu dinți: un obstacol real 165 acoperă ușa stângă, deci candidatul „evident” este invalid
și este ales următorul valid (`RIGHT:R0`). La fel se întâmplă cu un zid real de clădire
(`bld:blk:0-0:0-0`, candidatul din zid are marja −0,15 m), cu o mașină parcată la 0,10 m, cu o
platformă de 0,60 m și cu o groapă la −0,50 m. Când toate cele opt puncte sunt blocate, ieșirea este
`NO_VALID_EXIT` și toate cele opt starturi sunt refuzate de 192.

## Criteriul 2a — autoritatea revine la personaj în același tick

| Dovadă | Rezultat |
| --- | --- |
| Autoritatea după ieșire | `CHARACTER:player-character` |
| Comanda produsă de arbitrajul 193 | `CHARACTER` |
| Comenzi de vehicul înainte / după | 210 / 0 |
| Comenzi livrate personajului în tick-ul ieșirii | 1 |
| Livrare către vehicul după tranziție | refuzată cu `INACTIVE_CONSUMER_REFUSED` |
| A doua livrare în același tick | refuzată cu `DOUBLE_DELIVERY_REFUSED` |
| `throttle` ținut peste tranziție | neutralizat; comanda personajului este vidă |
| Tranziții de autoritate | 1 |
| Entități înainte / după | 2 / 2 |
| A doua ieșire în același tick | `DOUBLE_EXIT_REFUSED` |
| Ieșire repetată după eliberare | `NOT_CONTROLLED` |

## Criteriul 2b — mașina eliberată reia ruta de dinainte de preluare

Modul devine **AUTO** (niciodată MANUAL sau LEARNING), iar banda, `routeLaneIds`, `rideId` și
progresul pe rută sunt restaurate din snapshot-ul de dinainte de preluare; viteza, cota, manevra și
tick-ul rămân cele curente.

| Vehicul | Mod (baseline → preluare → eliberare) | Câmpuri identice | Cursă | Progres (m) | Amprentă |
| --- | --- | --- | --- | ---: | --- |
| `vehicle:civil-196` | AUTO → MANUAL → AUTO | 4/4 | — | 0 | identică |
| `vehicle:taxi-196` | LEARNING → MANUAL → AUTO | 4/4 | `ride-061-196` | 412,5 | identică |

Proba modifică deliberat starea condusă manual (bandă, rute și progres) înainte de ieșire, iar
câmpurile returnate sunt cele de dinainte de preluare, nu cele curente. Amprenta
`vehicleExitRouteBits` codifică fiecare număr ca 8 bytes IEEE-754 și fiecare text ca puncte de cod;
contractul își verifică invariantul și aruncă `INVALID_EXIT_STATE` dacă un câmp de rută s-ar schimba.

## Camera 194 — aceeași autoritate, în același tick

Camera reală pornește pe mașină și primește autoritatea personajului în tick-ul ieșirii: primul cadru
raportează deja `entityId` al personajului, tranziția este cea existentă de **18 tick-uri**
(17 → 0 tick-uri rămase), **18/18** cadre, o singură tranziție, **0** clonări și **0** scrieri de
țintă.

## Scenarii reale din raport

| Scenariu | Rezultat | Candidați | Ales | Marjă (m) | Sub sol (m) |
| --- | --- | ---: | --- | ---: | ---: |
| `open-street` | ACCEPTED | 1 | `LEFT:R0` | 0,0500 | 0 |
| `door-obstacle` | ACCEPTED | 2 | `RIGHT:R0` | 0,0500 | 0 |
| `occupied-by-car` | ACCEPTED | 2 | `RIGHT:R0` | 0,0500 | 0 |
| `rear-only` | ACCEPTED | 3 | `REAR:R0` | 0,0500 | 0 |
| `real-wall` | ACCEPTED | 2 | `RIGHT:R0` | 0,0500 | 0 |
| `step-too-high` | ACCEPTED | 2 | `RIGHT:R0` | 0,0500 | 0 |
| `below-map` | ACCEPTED | 2 | `RIGHT:R0` | 0,0500 | 0 |
| `moving-slow` | ACCEPTED | 1 | `LEFT:R0` | 0,0500 | 0 |
| `moving-fast` | REFUSED `VEHICLE_MOVING` | 0 | — | — | — |
| `no-valid-exit` | REFUSED `NO_VALID_EXIT` | 8 | — | — | — |
| `seat-not-controlled` | REFUSED `NOT_CONTROLLED` | 0 | — | — | — |
| `second-exit` | REFUSED `DOUBLE_EXIT_REFUSED` | 0 | — | — | — |

`real-wall` este un zid real din harta `neighbourhood-compact-v1`: mașina stă pe insula blocului la
0,02 m de fațada de vest, iar ieșirea de pe flancul stâng ar intra în clădire; flancul drept este
ales. `occupied-by-car` este o parcare cu două mașini la 0,10 m una de alta: golul nu încape
amprenta 191. `step-too-high` și `below-map` sunt fixtures explicite de politică (o platformă de
0,60 m și o groapă la −0,50 m), nu date inventate despre hartă.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, 0 erori |
| `npm run lint` | exit 0, 0 erori, 0 warnings |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (406 TypeScript files)`, probe negative 6 + 4 + 3, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | **3349 teste, 3349 trecute, 0 eșuate**, 1 suită, 111 210,9 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/character/exit-vehicle.test.ts" "tests/character/exit-vehicle-report.test.ts"` | **15 teste, 15 trecute, 0 eșuate** |
| `npm run exit:report` | **12/12 scenarii PASS**, criteriu 1 PASS, 2a PASS, 2b PASS, cameră PASS, start walker PASS (13/13), entități 2 → 2, tranziție cameră 18/18, determinism identic, verdict PASS; digest SHA-256 `419c5643fe21039781692ccc69bda3594330ac82044c594e6f3d4c2d4b75d0c` |
| `npm run exit:report -- --check` | `Exit vehicle report is current`, `Exit vehicle markdown is current`, exit 0 |

## Fișiere atinse

- `src/character/exit-vehicle.ts` (nou) și exportul de la finalul `src/character/index.ts`;
- `tests/character/exit-vehicle.test.ts`, `tests/character/exit-vehicle-suite.ts`,
  `tests/character/exit-vehicle-report.test.ts` (noi);
- `scripts/run-v3-exit-report.mjs` (nou) și `package.json` (o intrare nouă, ultima din `scripts`:
  `exit:report`);
- `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final);
- `Docs/Evidence/196-v3-exit/{README.md,report.json,report.md}`.

Nu au fost modificate `src/fleet`, `src/simulation`, `src/vehicles`, `src/input`, `src/ui`,
`src/app`, `src/persistence`, `Docs/11`, `Docs/18` sau bugetele.

## Limitări

- Contractul este pur headless: nu creează scenă, cameră Babylon, input sau corpuri. Compunerea
  (input 066, camera 194, vehiculul 024) aplică decizia în tick-ul curent; integrarea în bucla reală
  a jocului rămâne la compoziție.
- Punctul este planar, ca fizica 192: un portal, o trapă sau un gard suspendat nu sunt modelate, iar
  verticalitatea intră doar prin înălțimea suprafeței și prin plafonul real de 0,14 m.
- Punctul este mijlocul flancului sau al capului caroseriei, nu un mâner modelat; al doilea inel este
  la 0,60 m, deci o mașină parcată la mai puțin de 0,80 m de un zid nu are o ieșire „prin” zid.
- **Registrul 068 scrie doar `tick`, `controlMode` și `appliedProfileVersion`.** Ruta, banda, cursa
  și progresul restaurate sunt returnate ca date și trebuie aplicate de proprietarul 061/044.
  Contractul compară datele returnate bit-identic cu snapshot-ul de dinainte de preluare, dar nu
  poate muta singur registrul flotei — aceasta este limita explicită cerută de brief.
- Progresul pe rută este cel de dinainte de preluare, nu cel condus manual: segmentul MANUAL/LEARNING
  se închide separat (069), iar poziția fizică a mașinii rămâne cea reală. Dacă designul cere ca
  progresul manual să continue cursa, baseline-ul trebuie să fie starea curentă și contractul nu
  este locul potrivit.
- Mapa este planul de sol implicit: o suprafață sub el este refuzată cu `BELOW_MAP`. O hartă autorată
  cu alt plan de bază trebuie să își declare propriul `defaultGroundM`.
- Proba este deterministă și headless; feel-ul ieșirii, animația `exit-vehicle` din 191 și
  validarea în browser rămân la integrarea 196.
