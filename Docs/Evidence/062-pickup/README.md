# Dovezi 062 — pickup cu zonă, viteză și staționare

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale orchestratorului. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/pickup.ts` — detector pur de pickup peste asignarea reală 060 și lifecycle-ul 061: poligonul XZ al zonei reale `pickupZoneId`, prag de viteză, dwell în tick-uri simulate, toleranță de deplasare, motive închise și boarding idempotent.
- `src/fleet/index.ts` — export public aditiv.
- `tests/fleet/pickup.test.ts` — 12 teste țintite.
- `tests/fleet/pickup-fixture.ts` — flota 057, harta 032, plannerul 041, coada 059, asignările 060 și geometria reală a zonelor.
- `tests/fleet/pickup-report.ts` + `scripts/run-pickup-report.mjs` + `npm run ride:pickup` — raport mașină-citibil, simularea reală și tabelul uman.
- [Docs/pickup.md](../../pickup.md) — API, zonă, viteză/dwell, motive, integrare 061, tick, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) — paragraful de integrare.

## Rezultat

- Oprirea validă se acceptă exact la 180 de intervale de tick (3 s la 60 Hz): la tick-ul de start dovada este 0, la 179 intervale este încă `NOT_STATIONARY`, iar la 180 se scrie boarding-ul.
- Trecerea în viteză (5 m/s) prin zonă produce `TOO_FAST` în interior și `NOT_AT_PICKUP` în afara ei, zero dwell acumulat și zero tranziții; oprirea ulterioară începe o dovadă nouă de la 0.
- Poziția în afara oricărei zone produce `NOT_AT_PICKUP`; poziția în altă zonă reală de pickup (`sz:0-2`) sau într-o zonă exclusiv `DROPOFF` produce `WRONG_ZONE`. Nu există pickup după rază sau după marker.
- Marginea poligonului este inclusă: un punct exact pe `maxX` este în zonă. Ieșirea la 1 cm în afara zonei resetează dwell-ul, iar re-intrarea cere din nou 180 de intervale.
- Cursa necunoscută și cursa anulată înainte de pickup produc `WRONG_RIDE`; un `taxiId` străin produce `FOREIGN_VEHICLE`; un tick mai mic decât ultimul observat sau decât tick-ul autoritativ 061 produce `STALE_TICK`.
- Repetarea aceleiași observații în același tick nu numără de două ori. După boarding, rejucarea aceleiași observații sau o observație ulterioară întoarce `duplicate: true`, păstrează o singură tranziție `PICKUP_COMPLETE` și un singur `pickup-boarded:<requestId>`.
- Integrarea 061 scrie `ARRIVED_PICKUP` (dacă este necesar) și `PICKUP_COMPLETE` la tick-ul observației acceptate, apoi cursa rămâne `TO_DROPOFF` cu taxiul revendicat; nicio observație invalidă nu scrie `PICKUP_COMPLETE`.
- Simularea reală: 24 de taxiuri și 20 de civili din registry-ul 057, 32 de cereri 059, asignări 060 și 11 zone reale de pickup distincte. Toate cele 32 de curse sunt preluate exact o dată, fiecare cu 180 de tick-uri de dwell, apoi închise prin dropoff-ul 061; 32 de eliberări, zero respingeri de pickup, zero duplicate, zero taxiuri deținute de două curse simultan.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.
- `dispose()` readuce încercările, boarding-urile, observațiile și contoarele la zero fără a elibera revendicarea 060.

Raportul complet are [19/19 verificări](report.json), tabelul uman și simularea sunt în [report.md](report.md), iar ieșirile brute sunt în [checks.txt](checks.txt) și [tests.txt](tests.txt).

## Reguli verificate

- **Zonă reală:** numai `ride.pickupZoneId` din asignarea 060, rezolvat prin aria și nodurile hărții 032; acces `TAXI` și kind care nu este exclusiv `DROPOFF`; margine inclusă; fără id-uri paralele.
- **Viteză:** `speedMps <= 0.3` implicit; orice viteză peste prag resetează dovada.
- **Dwell:** numai observații pe tick-uri consecutive ale aceluiași taxi, cu deplasare XZ între observații sub 0.05 m; un tick lipsă, o teleportare, ieșirea din zonă sau o viteză prea mare resetează dovada.
- **Tick:** timp exclusiv simulat; tick-ul nu poate scădea și nu poate fi sub `lifecycle.currentTick()`.
- **Motive închise:** `WRONG_ZONE`, `TOO_FAST`, `NOT_STATIONARY`, `WRONG_RIDE`, `NOT_AT_PICKUP`, `STALE_TICK`, `FOREIGN_VEHICLE`.
- **Idempotență:** `pickup-boarded:<requestId>` este scris o singură dată; rejucarea întoarce boarding-ul existent fără tranziție nouă.
- **Ownership:** boarding-ul nu eliberează taxiul; cursa rămâne a taxiului asignat până la un rezultat terminal 061.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (186 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test tests/fleet/pickup.test.ts
# tests 12, pass 12, fail 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1226, pass 1226, fail 0 (baseline 1214/1214 înainte de 062)

volta run --node 24.21.0 --npm 11.19.0 -- npm run ride:pickup -- --check
# SUMMARY checks 19/19, boardings 32, dwell 180 ticks, overall PASS
# Pickup report is current: Docs/Evidence/062-pickup/report.json
# exit 0
```

Logul complet este în [checks.txt](checks.txt); transcriptul testelor țintite și sumarul suitei complete sunt în [tests.txt](tests.txt). Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md).

## Limite

- Nu este dropoff fizic 063, ETA 064, HUD 075, tarif/review/KPI 209 sau sănătatea flotei 065.
- Nu conduce taxiul și nu citește fizica: poziția și viteza sunt observații autoritare ale apelantului. Testele folosesc poziții sintetice din poligoanele reale, nu un playtest de condus.
- Nu inspectează ocuparea fizică/native a zonei, spațiul de manevră sau coliziunile; acelea aparțin contractelor 030/040. Catalogul 040 (`src/world/service-zones.ts`, `Docs/service-zones.md`) nu este prezent în acest checkout, deci 062 citește direct poligoanele validate 032, fără a forka id-urile zonelor. Integrarea cu catalogul 040 rămâne un follow-up de compoziție.
- Pragurile 0.3 m/s, 3 s și 0.05 m sunt provizorii și necesită calibrare pe fizica reală; ele sunt separate de preferințele de profil `pickup_*`.
- Retenția este bounded: 64 de încercări, 128 de boarding-uri, 256 de vertexuri per poligon. Un replay după evacuarea atât a boarding-ului, cât și a cursei terminale 061 nu mai poate fi recunoscut și întoarce `WRONG_RIDE`.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
