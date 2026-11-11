# Dovezi 122 — orașul te copiază

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform
[politicii proporționale](../../validation-policy.md). Nu se revendică FPS, GPU, Rapier, soak sau
hardware; contractul este de domeniu, fără UI, DOM sau efect în `main.ts`, deci proba de browser nu
este necesară.

## Ce s-a livrat

- `src/missions/city.ts` — contractul `122-mission-city-v1`: etapa 6 a campaniei
  (`campaign-6-city-copies-you`, definiție 116) ca evaluare a întregii flote cu profilul
  jucătorului, inclusiv a taxiurilor invizibile, cu expunere măsurată și cu verdicte separate pentru
  imitație și consecințe.
- `src/missions/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-city-fixture.ts` — fixture real: 057 registry (20 taxiuri, 20 civili),
  109 store cu patru versiuni, 110 activare la un tick viitor, 059/060/061 pentru fiecare cursă.
  Scenariul autorat spune doar ce taxi ia cursa și dacă aceasta se încheie livrată, avariată sau
  anulată; fiecare identitate, versiune, cost de rută și tranziție este output-ul modulelor livrate.
- `tests/missions/mission-city.test.ts` — 9 teste deterministe (contract, flotă prudentă, flotă
  riscantă, flotă parțial actualizată, flotă mixtă vizibil/nevizibil, refuzul profilului incompatibil
  și al activării străine, refuzul intrării care ar putea ascunde un vehicul sau o cursă, run fără
  curse, imutabilitate).
- `tests/missions/mission-city-report.ts` + `scripts/run-mission-city-report.mjs` — raport
  determinist cu 58 de verificări, 3 rulări și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 122): orașul te copiază".
- `package.json` — scriptul `missions:city`, adăugat la finalul blocului `scripts`.
- `Docs/Evidence/122-mission-city/report.json` și `report.md` — transcriptul real.
- `PBI/Done/122-mission_city.md` — taskul mutat fizic în Done.

## Cum evaluezi toată flota, inclusiv taxiurile invizibile

1. **057 dă populația.** Fixture-ul creează 20 de taxiuri și 20 de civili. Contractul cere ca lista
   de vehicule să corespundă exact numărului declarat pe categorii; o listă incompletă este refuzată,
   nu evaluată parțial. `coverage.complete` este `true` prin construcție, iar `omittedVehicles` este
   structural `0`.
2. **Camera doar observă.** `visibleVehicleIds` este o listă de observație. Orice vehicul care nu
   apare în ea este marcat `visible: false` și rămâne în evaluare. Un ID vizibil care nu există în
   flotă este refuzat, deci camera nu poate scoate tacit un vehicul.
3. **109/110 dau versiunea aplicată.** Fiecare vehicul are versiunea reală din starea 057, iar
   activarea 110 trebuie să fie exact versiunea publicată a jucătorului. O versiune din alt profil
   sau cu alt set de chei 092 este refuzată.
4. **061 dă serviciul.** Fiecare cursă terminală este citită din ciclul real: taxiul, starea,
   motivul închis și costul real de rută. O cursă activă sau a unui civil este refuzată.

## Cum se calculează expunerea

Expunerea unui vehicul este suma `totalCostSeconds` a curselor sale terminale **061**. O cursă
eșuată intră în expunere: taxiul a fost expus orașului chiar dacă serviciul nu s-a livrat. Rezultatul
raportează separat:

- `visibleSeconds` / `invisibleSeconds` și proporția `invisibleSeconds / totalSeconds`;
- `visibleRides` / `invisibleRides` și proporția `invisibleRides / totalRides`;
- `invisibleServedTaxis` — câte taxiuri din afara camerei au servit efectiv;
- `deliveredSeconds` și `missedSeconds` — serviciul livrat, respectiv planificat dar nelivrat.

În rularea prudentă, 37 din 40 de vehicule sunt invizibile; 5 taxiuri invizibile servesc 5 din cele
8 curse, iar expunerea lor invizibilă este **656,336487 s din 1.144,789845 s** (proporție
**0,573325**). Nu sunt ignorate: sunt majoritatea expunerii.

## Cum sunt separate imitația și consecințele

- **Imitația** compară fiecare valoare a versiunii aplicate cu valoarea publicată a jucătorului,
  cheie cu cheie, cu toleranță `1e-9`. Verdictul este `EXACT` când toate celulele coincid, `PARTIAL`
  când doar o parte coincid și `NONE` când niciuna. Se raportează și numărul de vehicule cu
  potrivire completă, fracția de celule potrivite, abaterea medie/maximă pe fiecare cheie și
  distribuția versiunilor aplicate.
- **Consecințele** citesc doar rezultatele reale **061**: curse livrate, curse ratate, anulări și
  eșecuri imputabile stilului (`TAXI_DAMAGED`, `TAXI_BLOCKED`). Verdictul este `HARMFUL` când există
  eșecuri imputabile, `NO_SERVICE` când nu s-a livrat nimic și `CLEAN` altfel. `harmRate` este
  `eșecuri imputabile / (curse livrate + eșecuri imputabile)`.
- Nu există un scor comun. Un profil riscant poate fi copiat `EXACT` și poate produce `HARMFUL`, iar
  o flotă parțial actualizată (`PARTIAL`) poate livra `CLEAN`. Poarta campaniei cere doar ca
  scenariul să fi rulat cu întreaga flotă și cu cel puțin o cursă terminală; nu cere un stil bun.

## Numere reale (din `report.json`)

| Rulare | Fidelitate | Vehicule potrivite | Expunere invizibilă | Curse invizibile | Consecințe | Livrate/Eșuate | Eșecuri imputabile | Harm rate | Poartă |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| prudent | `EXACT` | 40/40 | 0,573325 (656,336487 s din 1.144,789845 s) | 5/8 | `CLEAN` | 8/0 | 0 | 0 | `PROGRESS` |
| riscant | `EXACT` | 40/40 | 0,573325 (656,336487 s din 1.144,789845 s) | 5/8 | `HARMFUL` | 3/5 | 5 | 0,625 | `PROGRESS` |
| parțial actualizat | `PARTIAL` | 34/40 | 0,573325 (656,336487 s din 1.144,789845 s) | 5/8 | `CLEAN` | 8/0 | 0 | 0 | `PROGRESS` |

Rularea riscantă folosește exact același plan de curse și aceeași expunere ca rularea prudentă
(1.144,789845 s), deci diferența de consecințe nu poate fi explicată printr-un volum diferit de
serviciu. Din cele 5 eșecuri `TAXI_DAMAGED`, **1 este vizibil și 4 sunt invizibile**; serviciul
livrat scade la 520,051173 s, iar 624,738673 s planificați nu mai sunt livrați.

Rularea parțial actualizată are 34 de vehicule pe versiunea jucătorului și 6 pe versiunea
`city-122-stale`, care diferă doar prin `stop_full_probability` (0,55 față de 0,95). Fracția de
celule potrivite este **0,998125**, abaterea medie este **0,06**, iar abaterea maximă **0,4**.
Imitația este deci `PARTIAL`, dar toate cele 8 curse sunt livrate: verdictul de consecințe rămâne
`CLEAN`.

## Comenzi rulate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, fără avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (316 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2204 teste, 2204 pass, 0 fail, 75,6 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-city.test.ts"` | 9 teste, 9 pass, 0 fail |
| `npm run missions:city` | `SUMMARY checks 58/58, runs 3, overall PASS` |
| `npm run missions:city -- --check` | `Mission city report is current`, exit 0 |

## Limite

- Rulare Node deterministă: flota, versiunile de profil, activarea și cursele sunt output-uri reale
  057/059/060/061/109/110, dar nu există browser, renderer sau sesiune umană.
- Partea autorată este planul de curse (ce taxi ia cursa și dacă se încheie livrată, avariată sau
  anulată), ca planul de întâlniri declarat al lui 115. Misiunea nu inventează niciun cost de rută,
  identitate, versiune sau tranziție.
- Setul de cameră este o listă de observație declarată, pentru că 122 nu deține renderer. Vizibilitatea
  este stare de prezentare: nu schimbă ce vehicule sunt evaluate.
- Eșecurile imputabile sunt limitate la `TAXI_DAMAGED` și `TAXI_BLOCKED`; `ROUTE_UNAVAILABLE`,
  `SERVICE_TIMEOUT`, `PLAYER_ABANDONED`, `SCENARIO_RESET` și anulările rămân raportate, dar nu sunt
  atribuite profilului.
- Un candidat de fidelitate este o comparație de valori 109, nu o dovadă de comportament fizic în
  lume; consecințele vin din ciclul real de curse, nu dintr-o probă de condus.
- Nu se revendică FPS, frame, GPU, Rapier sau măsurători de hardware.
