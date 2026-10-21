# Activare atomică a profilului în flotă — PBI 110

`src/fleet/profile-activation.ts` (contract `110-profile-activation-v1`) transformă o versiune
publicată într-o comandă unică de activare aplicată la un tick comun tuturor vehiculelor existente.
`src/app/profile-activation.ts` (contract `110-profile-activation-app-v1`) este composition root-ul
care citește versiunea imuabilă 109 și injectează tick-ul fix acceptat.

```typescript
import { createFleetRegistry, createProfileActivation, createProfileActivationSource } from '../fleet';

const source = createProfileActivationSource({ profileId: 'academy', versionId: 'base-1' });
const registry = createFleetRegistry(configuration, { profileSource: source });
const activation = createProfileActivation({
  registry,
  source,
  engineVersion: store.engineVersion,
  clock: () => loop.getState().tick,
});
const published = activation.publish({
  profileId: 'academy',
  versionId: 'v2',
  engineVersion: store.engineVersion,
  publishedAtTick: tick,
  activateAtTick: tick + 1,
  reason: 'segment învățat acceptat',
  origin: 'LEARNED',
  idempotencyKey: 'segment-42',
});
const report = activation.applyAt(tick + 1);
```

## Tick comun

Publicarea creează exact o comandă `PENDING` pentru un tick viitor: `activateAtTick` trebuie să fie
strict mai mare decât tick-ul curent și decât `publishedAtTick`. `applyAt(tick)` nu scrie nimic
înainte de `activateAtTick` (raport `PENDING`) și aplică numai când `tick >= activateAtTick`. Tick-ul
scris efectiv este `activateAtTick`, ridicat la cel mai mare tick deja prezent în flotă dacă bucla
livrează activarea târziu; toate vehiculele primesc aceeași valoare. Timpul de publicare este
exclusiv tick-ul injectat; `now` produce doar metadata de audit `publishedAtIso` și nu programează
nimic.

După aplicare, comanda devine `APPLIED` și nu se mai reaplică: apelurile ulterioare întorc `IDLE`
fără nicio scriere, indiferent câte frame-uri trec.

## Atomicitate și rollback

Planul este validat integral înainte de prima scriere: fiecare `vehicleId` există, fiecare stare este
citibilă, iar tick-ul comun este un întreg sigur. Apoi fiecare vehicul primește
`{ tick, appliedProfileVersion }` printr-un singur `registry.updateState`. Dacă o scriere aruncă,
controller-ul restaurează fiecare vehicul deja scris la versiunea și modul de control anterioare,
închide comanda ca `REJECTED` și raportează `rolledBack: true`, `restored` și `exact`. Flota nu
rămâne niciodată cu două versiuni.

Contractul 057 refuză în mod deliberat să deruleze `tick` înapoi. Rollback-ul restaurează deci exact
versiunea și `controlMode`, iar `exact` spune dacă și tick-ul a putut fi readus (adevărat când nu s-a
avansat niciun tick). Această limitare este a registrului, nu ascunsă de controller.

## Vehicule create ulterior

Controller-ul expune un `CityProfileSource` (`activation.source`), iar composition root-ul oferă
`createCityProfileSource(activation)`. Un registru construit cu sursa scrisă de controller
(`createProfileActivationSource`) citește la fiecare `addVehicle` ținta curentă: versiunea în așteptare
cât timp comanda este `PENDING`, apoi versiunea aplicată. Vehiculele create după activare primesc
deci versiunea activă fără o a doua activare. O publicare respinsă sau un rollback readuc sursa la
ultima țintă aplicată.

## Stare păstrată

Se modifică numai `FleetVehicleState.appliedProfileVersion` și `FleetVehicleState.tick`. `controlMode`
rămâne neschimbat, iar rutele, cursele, asignările, pozițiile, vitezele și fizica nu sunt atinse:
controller-ul nu are acces la ele și nu apelează altă metodă a registrului decât `list`, `state` și
`updateState`. Vehiculele `MANUAL`, `LEARNING`, selectate, ascunse sau conduse de jucător intră în
același plan; selecția și vizibilitatea sunt stare de prezentare și nu filtrează niciodată registrul.

## Idempotență, istoric și respingeri închise

Aceeași `idempotencyKey` cu aceeași țintă întoarce comanda existentă (`duplicate: true`) fără o a
doua comandă. O cheie refolosită pentru altă țintă este `STALE_VERSION`. O a doua comandă distinctă
este refuzată `ACTIVATION_PENDING` până la aplicarea sau respingerea primei. Istoricul păstrează
maximum 16 comenzi, nu evacuează comanda `PENDING` și numără `droppedCommands`.

| Motiv | Când |
| --- | --- |
| `INVALID_VERSION` | identitatea versiunii este goală, are whitespace sau e prea lungă |
| `PROFILE_MISMATCH` | `profileId` diferă de profilul comun al flotei |
| `ENGINE_MISMATCH` | `engineVersion` diferă de motorul așteptat |
| `STALE_VERSION` | versiunea este deja activă sau cheia de idempotență e legată de altă țintă |
| `TICK_NOT_ADVANCING` | tick-ul publicat este în urmă ori `activateAtTick` nu avansează |
| `ACTIVATION_PENDING` | există deja o comandă în așteptare |
| `DISPOSED` | controller-ul a fost eliberat |

Erorile structurale (câmpuri necunoscute, tipuri greșite) aruncă `ContractValidationError`.
Eșecurile de aplicare sunt raportate separat prin `failure.stage` (`PLAN`, `APPLY`, `ROLLBACK`) și
nu inventează un motiv din vocabularul de publicare.

## Composition root

`readProfileActivation({ store, registry, activation? }, { versionId })` întoarce copia înghețată a
versiunii 109 sau un motiv închis: `VERSION_NOT_FOUND`, `PROFILE_MISMATCH`, `ENGINE_MISMATCH`.
`publishProfileVersion({ store, registry, activation, clock }, { versionId, origin, idempotencyKey,
reason })` citește versiunea, validează profilul și motorul, apoi publică la `clock()` cu
`activateAtTick = clock() + 1`. Un tick în urmă devine `STALE_TICK`; respingerea controller-ului este
propagată cu `activationCode`. Store-ul nu este niciodată scris: nu se creează versiuni și nu se
modifică checksum-ul.

## Ce nu este

Nu este estimator, worker, barrieră `learningEpoch`, persistare sau UI. Nu decide dacă un delta este
acceptat (102/103/109), nu publică versiuni și nu mișcă vehicule. Nu înlocuiește continuarea fizică:
manevrele deja angajate rămân valabile, iar noile ținte se folosesc la următoarea decizie relevantă.
Nu certifică performanța jocului integrat și nu are captură de browser.

Verificare: `node --import ./scripts/register-typescript.mjs --test tests/fleet/profile-activation.test.ts`,
`npm run profile:activate`, `npm run profile:activate -- --check`, plus `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run check:architecture` și `npm test`. Dovezile sunt în
[Evidence/110-profile-activation](Evidence/110-profile-activation/README.md).
