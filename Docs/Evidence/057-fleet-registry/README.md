# Dovezi 057 — registry flotă și mașini civile

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui. Nivel de validare: `functional` (politica 2026-10-08); nu se revendică browser, FPS, soak sau hardware.

## Ce s-a livrat

- `src/fleet/registry.ts` — registry pur: configurație validată, identități stabile 006, clase 023, `driverKind` TAXI/CIVILIAN, stare per vehicul, profil comun, raport pe clasă/tip, ownership și disposal.
- `src/fleet/index.ts` — export public al registry-ului lângă contractele de curse existente.
- `tests/fleet/fleet-registry.test.ts` — 9 teste țintite pe limite, duplicate, determinism, independența stării, profilul activ și disposal.
- `tests/fleet/fleet-registry-report.ts` + `scripts/run-fleet-registry-report.mjs` + `npm run fleet:registry` — raportul mașină-citibil și tabelul uman.
- [Docs/fleet-registry.md](../../fleet-registry.md) — contractul, API-ul, regulile de determinism, limitele.
- [Docs/07-flota-si-curse.md](../../07-flota-si-curse.md) și [Docs/README.md](../../README.md) — paragraful de module și indexul.

## Rezultat

| Populație | Total | Taxiuri | Civili | Sedan | Compact |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20 taxiuri / 20 civili | 40 | 20 | 20 | 20 | 20 |
| 24 taxiuri / 40 civili | 64 | 24 | 40 | 35 | 29 |
| 30 taxiuri / 40 civili | 70 | 30 | 40 | 39 | 31 |

Fiecare populație are ID-uri unice, ordine stabilă după ID, determinism identic la două creări din același seed, stare independentă și disposal la zero. Matricea completă `driverKind × class` este în [report.md](report.md) și [report.json](report.json).

## Reguli verificate

- **Identitate:** `createStableId('vehicle', namespace, [driverKind, slot])`; slot semantic pe patru cifre, maximum 256 code units. Nu există identitate paralelă față de 006, iar clasa provine din catalogul real 023.
- **Determinism:** clasa se derivă per vehicul din `deriveScenarioSeed` → `deriveVehicleSeed` → `randomUint32(..., 'fleet-class', 0)`. Ordinea de creare și mărimea populației nu sunt intrări: primele 20 de taxiuri au aceleași clase și într-o flotă de 30. `classPlan` este singura sursă explicită alternativă.
- **Validare:** 20–30 taxiuri, 20–40 civili, total ≤ 70, seed uint32, numere întregi, namespace care încape în limita de ID, profil nenul, plan de clase cu lungimi exacte și perechi clasă/tip compatibile; duplicatele de ID sunt respinse.
- **Independență:** fiecare vehicul are propriul obiect de stare înghețat (`tick`, `controlMode`, `appliedProfileVersion`). Actualizarea unui vehicul nu atinge altul, tick-ul este monoton per vehicul, iar lista de câmpuri nu conține selecție, cameră, vizibilitate sau mesh.
- **Profil comun:** vehiculele noi citesc `CityProfileSource.activeProfile()`; un `profileId` străin este respins. Vehiculele existente păstrează versiunea până la actualizare explicită sau activarea 110.
- **Ownership:** registry-ul nu deține corpuri, mesh-uri, listeners sau timere; `removeVehicle` eliberează o intrare, `dispose()` (idempotent) readuce totul la zero, iar mutațiile după disposal sunt respinse.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# PASS, exit 0 (tsc --noEmit și tsconfig.tests.json)

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# PASS, exit 0 (eslint . --max-warnings 0)

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# PASS (181 TypeScript files), negative probes 6+4+3, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1168, pass 1168, fail 0 (baseline 1159/1159 înainte de 057)

volta run --node 24.21.0 --npm 11.19.0 -- npm run fleet:registry -- --check
# SUMMARY configurations 3, checks 12/12, maximum 70, overall PASS
# Fleet registry report is current: Docs/Evidence/057-fleet-registry/report.json
```

Rularea fără `--check` rescrie [report.json](report.json) și [report.md](report.md); `--check` nu le rescrie.

## Limite

- Nu creează corpuri Rapier, poziții pe bandă, mesh-uri sau rute; compoziția lumii, 041 și 058 rămân separate.
- Nu implementează dispecerizare, curse, ETA, sănătatea flotei sau activarea atomică (059–065, 110).
- Nu impune regula unei singure autorități MANUAL/LEARNING; arbitrajul aparține 024/030.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/hardware.
