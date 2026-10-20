# Dovezi 065 — Blocaje, avarii și reset de scenariu

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale orchestratorului. Nivel de validare: `targeted` (politica 2026-10-08), cu probe locale de simulare și cost local; nu se revendică FPS, GPU, Rapier, soak sau hardware, iar gate-ul 220 rămâne proprietarul probei de performanță.

## Ce s-a livrat

- `src/fleet/fleet-health.ts` — stări închise `AVAILABLE`/`BLOCKED`/`DAMAGED`/`OFFLINE` conduse de fapte externe 029/030, integrare cu revendicările 060 și lifecycle-ul 061, reset de scenariu coerent și idempotent.
- `src/fleet/scenario-fixture.ts` — fixture reproductibil 20/24/30 taxiuri plus 20–40 civili, peste harta reală 032, cu poziții deterministe și `dispose()` la zero.
- `src/fleet/{dispatcher,ride-demand,ride-fsm,eta}.ts` — porturi aditive `reset()` pentru granița de scenariu, fără schimbarea rapoartelor existente.
- `src/fleet/dispatcher.ts` — `release` permite eliberarea explicită a unei revendicări active al cărei taxi a fost scos din registry; un ID fără revendicare rămâne `Unknown taxi`, iar `step` continuă să eșueze zgomotos.
- `src/fleet/index.ts` — export public aditiv.
- `tests/fleet/fleet-health.test.ts` — 13 teste țintite.
- `tests/fleet/fleet-health-fixture.ts` — lumea reală 057–064 plus contractul 065.
- `tests/fleet/fleet-health-report.ts` + `scripts/run-fleet-health-report.mjs` + `npm run fleet:health` — raport mașină-citibil, simularea reală și tabelul uman.
- [Docs/fleet-health.md](../../fleet-health.md) — API, stări/fapte, ordinea de integrare, resetul, politicile, limitele și ownership-ul.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) — paragraful de integrare.
- [Docs/dispatcher.md](../../dispatcher.md), [Docs/ride-demand.md](../../ride-demand.md), [Docs/ride-fsm.md](../../ride-fsm.md), [Docs/eta.md](../../eta.md) — notele porturilor de reset și ale eliberării taxiului dispărut.
- [report.json](report.json), [report.md](report.md), [checks.txt](checks.txt), [tests.txt](tests.txt) — transcripturile.

## Rezultat

- Faptele închise produc exact o stare: `TRAFFIC_BLOCK`/`IMMOBILIZATION` → `BLOCKED`, `COLLISION_DAMAGE` → `DAMAGED`, `SERVICE_WITHDRAWN` → `OFFLINE`, `RECOVERY`/`SERVICE_RETURNED` → `AVAILABLE`.
- Un taxi avariat cu o cursă activă este eliberat din revendicare și cursa se închide cu `FAILED`/`TAXI_DAMAGED`; blocarea produce `TAXI_BLOCKED`, scoaterea din serviciu produce `TAXI_REMOVED`. Revendicarea fără cursă este eliberată direct cu `TAXI_BLOCKED`/`TAXI_DAMAGED`/`TAXI_REMOVED`.
- Taxiul avariat/blocat/offline nu apare în `availableTaxis()` și nu este asignat: cu un singur taxi avariat și restul offline, pasul alege taxiul valid; cu toate taxiurile avariate, pasul raportează `NO_TAXI` și zero asignări.
- Resetul închide cursele active cu `SCENARIO_RESET` (2 curse în simulare), eliberează revendicările rămase, readuce sănătatea la `AVAILABLE` pentru toate cele 24 de taxiuri și golește coada, cursorul de program și ETA. `report().consistent` este `true`.
- Un al doilea reset la același tick raportează zero curse închise, zero eliberări și zero marcaje de sănătate; starea structurală este identică și nu apar duplicate.
- Un taxi dispărut din registry nu păstrează cursa: resetul o închide cu `SCENARIO_RESET`, nu inventează o revendicare și lasă 19 taxiuri reale, zero asignări și zero curse active.
- Următorul scenariu reutilizează aceleași identități 006: cererea, asignarea și cursa au din nou ID-urile stabile, ETA veche este `undefined` după reset, iar o observație nouă produce `ESTIMATED`. Un `factId` folosit înainte de reset este acceptat din nou și închide noua cursă cu `TAXI_DAMAGED`.
- Politicile sunt explicite: `PRESERVE` păstrează profilul `profile-v2` și contoarele (1 fapt), dar sănătatea este tot `AVAILABLE` pentru toate taxiurile; `RESET` readuce profilul la `profile-v1`, contoarele la zero și resetează 40 de profile de vehicul.
- Fixture-ul gate 220: 20/24/30 taxiuri cu 40 civili fiecare, total 60/64/70 vehicule, 32 de cereri, ID-uri unice și câte o bandă reală pentru fiecare taxi; două construcții cu aceleași opțiuni produc rapoarte structurale identice.
- Simularea reală: 24 taxiuri, 40 civili, 32 cereri 059, 8 asignări 060 și 8 curse 061; 1 cursă completă, 3 închise de fapte de sănătate, 1 eșuată prin timeout, 1 anulată, 2 active închise de reset, 9 eșantioane ETA.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier. `dispose()` readuce sănătatea, estimările, asignările, coada, cursele și registry-ul la zero fără a elibera contractele injectate.

Raportul complet are [28/28 verificări](report.json), tabelul uman și simularea sunt în [report.md](report.md), iar ieșirile brute sunt în [checks.txt](checks.txt) și [tests.txt](tests.txt).

## Reguli verificate

- **Stare din fapte:** fiecare fapt are exact o consecință; nu există inferență din viteză, coliziuni sau renderer. Ultimul fapt câștigă, iar `factId` este idempotent și conflictual-refuzat.
- **Revendicare:** o cursă activă este închisă prin lifecycle înainte de publicarea stării; 061 eliberează exact revendicarea, apoi 060 primește starea de sănătate. O revendicare fără cursă este eliberată direct cu motivul potrivit.
- **Disponibilitate:** `BLOCKED`, `DAMAGED` și `OFFLINE` nu sunt niciodată candidate; un taxi `ASSIGNED` rămâne sănătos `AVAILABLE`, iar `report().consistent` verifică fiecare status 060.
- **Reset:** tick monoton, validare înainte de mutație, curse `SCENARIO_RESET`, revendicări rămase `FAILED`, coadă/cursor/ETA rewindate, sănătate `AVAILABLE`, profiluri/statistici numai după politica explicită.
- **Idempotență:** al doilea reset nu creează curse, eliberări, marcaje sau duplicate; identitățile 006 sunt reutilizabile, dar starea veche nu este servită.
- **Ownership:** modulul deține numai marcajele, jurnalul, memoria de `factId` și contoarele; `dispose()` nu eliberează revendicările dispecerului.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (190 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test tests/fleet/fleet-health.test.ts
# 13/13 pass, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# 1265/1265 pass, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run fleet:health
# 28/28 checks, closed 2, presets 20/24/30, overall PASS
volta run --node 24.21.0 --npm 11.19.0 -- npm run fleet:health -- --check
# Fleet health report is current, exit 0
```

## Limitări

- Faptele de avarie/blocaj sunt intrări explicite; modulul nu detectează coliziuni, imobilizări sau blocaje și nu înlocuiește 029/030.
- Nu există recuperare fizică, teleportare sau ștergere a istoricului 029; `RECOVERY` schimbă numai disponibilitatea.
- Resetul nu rewindează tick-ul global și nu creează un ceas nou; tick-ul rămâne monoton, iar programul 059 este interpretat în continuare pe aceeași axă.
- `PRESERVE` pentru statistici păstrează contoarele cumulative, dar coada, cursorul, ETA și sănătatea sunt tot rewindate; nu este o reluare a scenariului întrerupt.
- Memoria de `factId` este plafonată la 1024; un ID evacuat nu mai este recunoscut ca duplicat și este raportat prin `droppedFactIds`.
- Fixture-ul 20/24/30 este o probă funcțională reproductibilă, nu o măsurare de FPS/GPU/Rapier/hardware; gate-ul 220 trebuie să ruleze probele proprii de performanță.
- Nu există integrare HUD, browser, renderer sau savefile; valorile sunt pure, pentru compoziția 073–075 și pentru gate-ul 220.
