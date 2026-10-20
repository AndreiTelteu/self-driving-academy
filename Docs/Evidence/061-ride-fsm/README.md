# Dovezi 061 — lifecycle cursă și eșecuri

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale orchestratorului. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak, Rapier sau hardware.

## Ce s-a livrat

- `src/fleet/ride-fsm.ts` — state machine pură peste asignările reale 060: stări explicite `TO_PICKUP` → `PICKUP` → `TO_DROPOFF` → `DROPOFF` → `COMPLETED`, plus `FAILED`/`CANCELLED`, vocabular închis de evenimente și motive, idempotență după `eventId`, tick monoton, ownership-ul taxiului asignat și eliberarea explicită a revendicării 060 la fiecare stare terminală.
- `src/fleet/index.ts` — export public al contractului.
- `tests/fleet/ride-fsm.test.ts` — 13 teste țintite.
- `tests/fleet/ride-fsm-fixture.ts` — flota 057 reală, harta 032, plannerul 041, coada 059 și asignările 060.
- `tests/fleet/ride-fsm-report.ts` + `scripts/run-ride-fsm-report.mjs` + `npm run ride:lifecycle` — raportul mașină-citibil, simularea executată și tabelul uman.
- [Docs/ride-fsm.md](../../ride-fsm.md) — API, stări/tranziții, evenimente, motive, tick, revendicare/eliberare, restart, limite și ownership.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) — paragraful de integrare.

## Rezultat

- Simularea reală: 24 de taxiuri și 20 de civili din registry-ul 057, 32 de cereri din programul 059 și asignări reale 060. Toate cele 32 de curse ajung exact o dată într-o stare terminală: 24 `COMPLETED`, 3 `FAILED`, 5 `CANCELLED`; 32 de eliberări explicite, zero revendicări rămase, zero taxiuri deținute de două curse simultan.
- Fluxul complet produce stările `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED` și evenimentele `ASSIGNED → ARRIVED_PICKUP → PICKUP_COMPLETE → ARRIVED_DROPOFF → DROPOFF_COMPLETE`; taxiul revine la `AVAILABLE` prin `release(..., 'COMPLETED', tick)`.
- Anularea și eșecul poartă motiv obligatoriu (`PASSENGER_CANCELLED`, respectiv `TAXI_DAMAGED`) și eliberează revendicarea cu `CANCELLED`/`FAILED`.
- O tranziție ilegală (`DROPOFF_COMPLETE` din `TO_PICKUP`, `ARRIVED_PICKUP` repetat, `CANCELLED` din `DROPOFF`) este refuzată fără schimbare de stare și fără eliberare; un al doilea rezultat terminal este refuzat, iar primul rămâne intact.
- Rejucarea aceluiași `eventId` întoarce tranziția originală cu `duplicate: true` și zero eliberări; rejucarea cu alt eveniment aruncă `Ride event id conflict`.
- Un eveniment cu tick mai mic decât tick-ul autoritativ sau decât ultimul eveniment aruncă `Stale ride tick`; `advance` descrescător este refuzat.
- Dacă revendicarea a fost eliberată extern, o tranziție terminală aruncă `Ride taxi claim is missing`, iar cursa rămâne `DROPOFF` — nu se inventează o stare `COMPLETED` fără eliberare.
- Schimbarea taxiului selectat nu anulează cursa: un câmp `taxiId` într-un eveniment este respins, iar cursa își păstrează `taxiId`/`assignmentId` și revendicarea.
- `snapshot`/`restore` readuc o cursă activă cu starea, evenimentele aplicate și revendicarea reală; o cursă terminală, o cursă fără revendicare și un `transitionId` forjat sunt refuzate explicit.
- `dispose()` readuce cursele, tranzițiile și contoarele la zero, fără a elibera revendicarea dispecerului injectat.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.

Raportul complet are [26/26 verificări](report.json), tabelul uman și simularea sunt în [report.md](report.md), iar ieșirea brută a testelor 061 este în [tests.txt](tests.txt).

## Reguli verificate

- **Stări și muchii închise:** `RIDE_TRANSITIONS` este singura sursă de adevăr; stările terminale nu au muchii de ieșire, deci dublul terminal este imposibil.
- **Evenimente unice:** fiecare tranziție are `transitionId` stabil 006 din `(rideId, eventId)`, iar evenimentele sunt idempotente după `eventId`; un conflict de payload este refuzat.
- **Motive terminale:** `FAILED` folosește numai `RIDE_FAILURE_REASONS`, `CANCELLED` numai `RIDE_CANCEL_REASONS`; celelalte evenimente refuză orice motiv.
- **Tick monoton:** evenimentele noi și `advance` nu pot scădea; nu există ceas de perete sau sursă ascunsă de timp.
- **Ownership:** cursa copiază asignarea 060 și nu are API de retargetare; taxiul selectat nu este o intrare a lifecycle-ului.
- **Eliberare explicită:** fiecare stare terminală verifică revendicarea, apelează `dispatcher.release(...)` cu `COMPLETED`/`CANCELLED`/`FAILED` și cere asignarea returnată; abia apoi înregistrează tranziția.
- **Restart sigur:** `restore` cere un lifecycle gol, un lanț de tranziții valid, id-uri stabile și o revendicare încă activă; o cursă terminală nu poate fi restaurată ca activă.
- **Ownership la disposal:** `dispose()` nu fabrică eliberări și nu atinge dispecerul, registry-ul, coada sau plannerul injectate.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (185 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1214, pass 1214, fail 0 (baseline 1201/1201 înainte de 061)

volta run --node 24.21.0 --npm 11.19.0 -- npm run ride:lifecycle -- --check
# SUMMARY checks 26/26, rides 32, releases 32, overall PASS
# Ride lifecycle report is current: Docs/Evidence/061-ride-fsm/report.json
# exit 0
```

Logul complet al comenzilor este în [checks.txt](checks.txt). Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md).

## Limite

- Nu este pickup/dropoff fizic 062–063: nu citește poziția, viteza sau zona reală și nu decide oprirea ori durata de staționare; acelea emit evenimentele lifecycle-ului.
- Nu este ETA live 064, HUD 075, tarif/review/KPI 209 sau sănătatea flotei 065. Un taxi avariat în timpul cursei este închis de lifecycle cu `FAILED`; remarkarea `DAMAGED` aparține contractului de sănătate.
- Nu alege taxiuri, nu replanifică rute și nu modifică asignarea 060; nu mișcă taxiuri și nu deține poziții.
- Snapshot-ul este o valoare pură; persistarea în savefile și migrarea aparțin PBI-urilor 127–136.
- Înregistrările terminale peste plafonul de 128 sunt eliminate cu `stats().droppedTerminal`; istoricul complet al curselor închise aparține 063/209/210.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware.
