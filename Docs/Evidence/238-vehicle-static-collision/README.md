# 238 — Coliziunea mașinii conduse cu decorul și clădirile, și orientarea decorului

Trei defecte reale observate la jucarea compunerii 236 în browser (`npm run dev`).

## Cauze

1. Bănci întoarse: `createCityDecorPlan` (`src/rendering/city-decor.ts`, apelul `item(rule.kind, x, z, heading, ...)`)
   rotea orice obiect cu direcția de mers a trotuarului. Șablonul băncii are spătarul la −Z local, deci spătarul
   privea în direcția opusă drumului pentru jumătate din bănci (laturile S/N/W/E au `heading` diferit și
   `side` aleatoriu ±1). Același defect avea adăpostul (peretele de sticlă la −Z) și brațul stâlpului (+Z).
2. Mașina prin decor: `driveVehicle` din `src/app/walking-composition.ts` integra
   `position += forward * speed * dt` fără nicio coliziune; decorul 146 nu are colliders prin contract, iar
   227 (`src/world/destructible-decor.ts`) nu este conectat la compunerea din browser (scena desenează planul 146 direct).
3. Mașina în clădiri: aceeași integrare liberă; blocatoarele clădirilor existau doar pentru walker (192) și
   pentru ocluzia camerei 194, deci mașina intra în solid iar camera rămânea în afară.

## Reparația

- `src/rendering/city-decor.ts`: `facingYaw` îndreaptă +Z local spre cea mai apropiată margine de carosabil
  (benzi și intersecții) pentru `bench`, `bus-shelter`, `street-lamp`; celelalte tipuri sunt simetrice și nu s-au schimbat.
- `src/app/vehicle-collision.ts` (nou): lume de coliziune cu grilă uniformă, clădirile 192 (poligoane convexe,
  SAT) și decorul 146 (cerc de rază `radiusM`), corp = dreptunghiul rotit, mătură în sub-pași de 0,1 m,
  rezolvare prin translația minimă și alunecare.
- `src/app/walking-composition.ts`: `driveVehicle` mătură mișcarea prin lumea de coliziune; viteza spre obstacol
  se anulează, iar sub 0,05 m/s după atingere mașina e oprită. Frâna ținută din oprire dă marșarier lent (max 3 m/s).
- `src/app/index.ts`: exporturi.

## Dovezi

`node --import ./scripts/register-typescript.mjs --test tests/app/vehicle-collision.test.ts`: 13/13 pass.
Pe codul vechi (coliziunea ocolită și `city-decor.ts` neschimbat): 3 pass, 9 fail; cele 3 care trec lucrează direct
pe modulul nou de coliziune, deci nu depind de cod vechi.
Suita integrală: `npm test` 3441/3441.
