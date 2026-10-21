# PBI 110 — activare atomică în întreaga flotă

Implementat în `src/fleet/profile-activation.ts` (`110-profile-activation-v1`) și
`src/app/profile-activation.ts` (`110-profile-activation-app-v1`), exportate aditiv prin
`src/fleet/index.ts` și `src/app/index.ts`. Controller-ul publică o singură comandă `PENDING` pentru
următorul tick comun și o aplică tuturor vehiculelor existente prin `registry.updateState`, scriind
exclusiv `appliedProfileVersion` și `tick`. Composition root-ul citește versiunea imuabilă 109 și
injectează tick-ul fix acceptat.

## Contract

- `createProfileActivationSource({ profileId, versionId })` — sursa scrisă de controller, dată la
  `createFleetRegistry`; vehiculele create ulterior citesc ținta curentă.
- `createProfileActivation({ registry, source?, engineVersion?, clock?, now?, maxCommands? })` —
  `publish`, `applyAt`/`advance`, `pending`, `activeProfile`, `source`, `commands`, `stats`, `dispose`.
- `readProfileActivation({ store, registry, activation? }, { versionId })` — copie înghețată 109 sau
  `VERSION_NOT_FOUND` / `PROFILE_MISMATCH` / `ENGINE_MISMATCH`; fără scriere în store.
- `publishProfileVersion({ store, registry, activation, clock }, { versionId, origin,
  idempotencyKey, reason })` — publică la `clock()` cu `activateAtTick = clock() + 1`; un tick în
  urmă devine `STALE_TICK`, iar respingerea controller-ului păstrează `activationCode`.
- `createCityProfileSource(activation)` — adaptor `CityProfileSource` read-only.

## Reguli demonstrate

- **Tick comun**: nimic nu se schimbă înainte de `activateAtTick` (raport `PENDING`); la tick toate
  cele 64 de vehicule primesc aceeași versiune și același tick. O comandă aplicată nu se reaplică.
- **Atomicitate**: planul complet (id-uri, stări, tick) este validat înainte de prima scriere; un
  eșec injectat la al 11-lea vehicul restaurează cele 10 deja scrise, închide comanda `REJECTED` și
  raportează `rolledBack`, `restored`, `exact`. Flota nu rămâne cu două versiuni.
- **Rollback și tick**: registrul 057 refuză derularea `tick`; rollback-ul restaurează exact
  versiunea și `controlMode`, iar `exact: false` semnalează că tick-ul monotonic a rămas avansat.
- **Vehicule ulterioare**: un vehicul creat cât timp comanda e `PENDING` primește ținta în așteptare;
  unul creat după aplicare primește versiunea aplicată. O publicare respinsă readuce sursa la ultima
  țintă aplicată.
- **Stare păstrată**: `MANUAL`, `LEARNING`, vehiculele selectate/ascunse/conduse de jucător sunt în
  același plan; `controlMode`, lista de vehicule, raportul de flotă, rutele, cursele și fizica nu
  sunt atinse. Testul înregistrează fiecare patch: doar `tick` și `appliedProfileVersion`.
- **Idempotență și limite**: aceeași cheie întoarce comanda existentă; o a doua comandă distinctă este
  `ACTIVATION_PENDING`; istoricul păstrează 16 comenzi și numără `droppedCommands`.
- **Motive închise**: `INVALID_VERSION`, `PROFILE_MISMATCH`, `ENGINE_MISMATCH`, `STALE_VERSION`,
  `TICK_NOT_ADVANCING`, `ACTIVATION_PENDING`, `DISPOSED`. Eșecurile de aplicare sunt raportate separat
  prin `failure.stage`.

## Dovezi

`tests/fleet/profile-activation.test.ts` — 16 teste, 16 pass. Acoperă flota completă 24+40,
înainte/după tick, moduri `MANUAL`/`LEARNING` păstrate, vehicul creat ulterior, câmpuri scrise,
cheie idempotentă duplicată, a doua comandă în așteptare, tick în urmă, versiune invalidă/profil
străin/motor incompatibil, versiune 109 imuabilă, rollback injectat, istoric mărginit, sursa de
profil, lipsa reaplicării pe 60 de frame-uri și `dispose` idempotent.

`tests/app/profile-activation-report.ts` + `scripts/run-profile-activation-report.mjs` —
7 scenarii, 51 verificări, 51 PASS. Transcript: [report.json](report.json) / [report.md](report.md).

Comenzi (rulate din rădăcină):

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (230 TypeScript files)` |
| `npm test` | exit 0, `tests 1533`, `pass 1533`, `fail 0` |
| `npm run profile:activate` | exit 0, `SUMMARY checks 51/51, scenarios 7, overall PASS` |
| `npm run profile:activate -- --check` | exit 0, `Profile activation report is current` |

## Limite

- Rollback-ul nu poate derula `tick` (contract 057); `exact: false` este raportat explicit, iar
  versiunea și modul de control sunt restaurate integral.
- Controller-ul este exclusiv în memorie: fără persistență, reluare după crash sau barrieră
  `learningEpoch` (127/205). Nu publică versiuni și nu decide acceptarea unui delta.
- Fără UI, captură de browser, FPS sau măsurătoare hardware; nu certifică performanța jocului
  integrat. Nu există poziții/viteze în `FleetVehicleState`, deci „fizica neatinsă” este dovedită
  prin suprafețele scrise (doar `tick` și `appliedProfileVersion`), nu printr-un fixture fizic.
- PBI-ul a rămas în `In Progress`; acest raport nu mută task-ul și nu rulează validatorul de board.
