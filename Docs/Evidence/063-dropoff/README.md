# Dovezi 063 — dropoff și finalizarea cursei

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale orchestratorului. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/dropoff.ts` — detector pur de livrare peste asignarea reală 060 și lifecycle-ul 061: poligonul XZ al zonei reale `dropoffZoneId`, prag de viteză, dwell în tick-uri simulate, toleranță de deplasare, motive închise și finalizare idempotentă cu păstrarea metricilor.
- `src/fleet/index.ts` — export public aditiv.
- `tests/fleet/dropoff.test.ts` — 13 teste țintite.
- `tests/fleet/dropoff-fixture.ts` — flota 057, harta 032, plannerul 041, coada 059, asignările 060, geometria reală a zonelor și două căi de progres către `TO_DROPOFF` (062 real sau muchiile 061).
- `tests/fleet/dropoff-report.ts` + `scripts/run-dropoff-report.mjs` + `npm run ride:dropoff` — raport mașină-citibil, simularea reală și tabelul uman.
- [Docs/dropoff.md](../../dropoff.md) — API, zonă, viteză/dwell, motive, integrare 061, tick, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) — paragraful de integrare.

## Rezultat

- Livrarea validă se acceptă exact la 180 de intervale de tick (3 s la 60 Hz): la tick-ul de start dovada este 0, la 179 intervale este încă `NOT_STATIONARY`, iar la 180 se scrie finalizarea. Cursa trece `TO_DROPOFF → DROPOFF → COMPLETED` la același tick (200 în proba de bază), cu tranzițiile `ASSIGNED → ARRIVED_PICKUP → PICKUP_COMPLETE → ARRIVED_DROPOFF → DROPOFF_COMPLETE`.
- `DROPOFF_COMPLETE` eliberează exact revendicarea 060 cu `COMPLETED`: asignarea dispare din dispecer, taxiul revine la `AVAILABLE` și există o singură eliberare. Costurile, zonele, rutele și `startedTick` copiate din asignare rămân identice după finalizare.
- Trecerea în viteză (5 m/s) prin zonă produce `TOO_FAST` în interior și `NOT_AT_DROPOFF` în afara ei, zero dwell acumulat și zero tranziții; oprirea ulterioară începe o dovadă nouă de la 0.
- Poziția în afara oricărei zone produce `NOT_AT_DROPOFF`; poziția în altă zonă reală de dropoff (`sz:0-1`) sau în zona exclusiv `PICKUP` a cursei (`sz:0-0`) produce `WRONG_ZONE`. Un id de destinație existent dar exclusiv `PICKUP` este refuzat tot cu `WRONG_ZONE`, înainte de dwell.
- Marginea poligonului este inclusă: un punct exact pe `maxX` este în zonă. Ieșirea la 1 cm în afara zonei resetează dwell-ul, iar re-intrarea cere din nou 180 de intervale.
- Cursa necunoscută și cursă terminală (`CANCELLED`, `FAILED`, `COMPLETED` fără event id-ul acestui modul) produc `WRONG_RIDE`; o cursă activă încă în `TO_PICKUP` sau `PICKUP` produce `RIDE_NOT_ON_TRIP`; un `taxiId` străin produce `FOREIGN_VEHICLE`; un tick mai mic decât ultimul observat sau decât tick-ul autoritativ 061 produce `STALE_TICK`.
- Repetarea aceleiași observații în același tick nu numără de două ori. După finalizare, rejucarea aceleiași observații sau o observație ulterioară întoarce `duplicate: true`, păstrează o singură tranziție `DROPOFF_COMPLETE`, un singur `dropoff-complete:<requestId>` și o singură eliberare 060.
- Fără revendicarea reală, 061 refuză `DROPOFF_COMPLETE` cu `Ride taxi claim is missing`; cursa rămâne `DROPOFF`, modulul nu înregistrează nicio finalizare, iar dispecerul păstrează eliberarea externă (`TAXI_BLOCKED`).
- Cursa manuală și cea autonomă folosesc aceeași funcție: `observe` nu are câmp de mod, un câmp `controlMode` este refuzat, iar două lumi identice (una progresată prin 062 real, alta prin muchiile 061) produc aceleași decizii și aceeași finalizare la tick 400.
- Simularea reală: 24 de taxiuri și 20 de civili din registry-ul 057, 32 de cereri 059, asignări 060, pickup 062 real și 8 zone reale de dropoff distincte. Toate cele 32 de curse sunt preluate și livrate exact o dată, fiecare cu 180 de tick-uri de dwell la pickup și 180 la destinație, 32 de eliberări, zero respingeri și zero duplicate de pickup/dropoff, zero taxiuri deținute de două curse simultan.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.
- `dispose()` readuce încercările, finalizările, observațiile și contoarele la zero fără a elibera revendicarea 060.

Raportul complet are [22/22 verificări](report.json), tabelul uman și simularea sunt în [report.md](report.md), iar ieșirile brute sunt în [checks.txt](checks.txt) și [tests.txt](tests.txt).

## Reguli verificate

- **Zonă reală:** numai `ride.dropoffZoneId` din asignarea 060, rezolvat prin aria și nodurile hărții 032; acces `TAXI` și kind care nu este exclusiv `PICKUP`; margine inclusă; fără id-uri paralele.
- **Viteză:** `speedMps <= 0.3` implicit; orice viteză peste prag resetează dovada.
- **Dwell:** numai observații pe tick-uri consecutive ale aceluiași taxi, cu deplasare XZ între observații sub 0.05 m; un tick lipsă, o teleportare, ieșirea din zonă sau o viteză prea mare resetează dovada.
- **Tick:** timp exclusiv simulat; tick-ul nu poate scădea și nu poate fi sub `lifecycle.currentTick()`.
- **Motive închise:** `WRONG_ZONE`, `TOO_FAST`, `NOT_STATIONARY`, `WRONG_RIDE`, `NOT_AT_DROPOFF`, `STALE_TICK`, `FOREIGN_VEHICLE`, `RIDE_NOT_ON_TRIP`.
- **Finalizare:** `DROPOFF_COMPLETE` este scris o singură dată, după un dropoff valid și numai din `DROPOFF`; eliberarea 060 este obligatorie și metricile cursei rămân neschimbate.
- **Ownership:** modulul nu eliberează singur taxiul; el cere tranziția terminală 061, care apelează `dispatcher.release(taxiId, COMPLETED, tick)`.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (187 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test tests/fleet/dropoff.test.ts
# tests 13, pass 13, fail 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1239, pass 1239, fail 0 (baseline 1226/1226 înainte de 063)

volta run --node 24.21.0 --npm 11.19.0 -- npm run ride:dropoff -- --check
# SUMMARY checks 22/22, completed 32, dwell 180 ticks, overall PASS
# Dropoff report is current: Docs/Evidence/063-dropoff/report.json
# exit 0
```

Logul complet este în [checks.txt](checks.txt); transcriptul testelor țintite și sumarul suitei complete sunt în [tests.txt](tests.txt). Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md).

## Limite

- Nu este ETA 064, HUD 075, tarif/review/KPI 209 sau sănătatea flotei 065.
- Nu conduce taxiul și nu citește fizica: poziția și viteza sunt observații autoritare ale apelantului. Testele folosesc poziții sintetice din poligoanele reale, nu un playtest de condus.
- Nu inspectează ocuparea fizică/native a zonei, spațiul de manevră sau coliziunile; acelea aparțin contractelor 030/040. Catalogul 040 (`src/world/service-zones.ts`, `Docs/service-zones.md`) nu este prezent în acest checkout, deci 063 citește direct poligoanele validate 032, fără a forka id-urile zonelor. Integrarea cu catalogul 040 rămâne un follow-up de compoziție.
- Pragurile 0.3 m/s, 3 s și 0.05 m sunt provizorii și necesită calibrare pe fizica reală; ele sunt separate de preferințele de profil `pickup_*` și sunt verificate ca fiind identice cu regulile 062.
- Retenția este bounded: 64 de încercări, 128 de finalizări, 256 de vertexuri per poligon. O finalizare evacuată este reconstruită din tranziția 061 cât timp cursa terminală este reținută; după evacuarea ambelor, un replay întoarce `WRONG_RIDE`.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
