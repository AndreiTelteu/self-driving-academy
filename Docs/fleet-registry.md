# Registry flotă și mașini civile 057

Status: implementare și validare funcțională locală. Contractul este pur, fără DOM, browser, Babylon, Rapier sau ceas de perete. Boardul canonic și publicarea rămân ale părintelui.

`src/fleet/registry.ts` creează populația V1: 24 de taxiuri configurabile între 20 și 30 și 20–40 de mașini civile. Fiecare vehicul primește o identitate stabilă 006, clasa mecanică reală 023, un `driverKind` explicit și o stare proprie, independentă de cameră și renderer.

## API

```typescript
const registry = createFleetRegistry(configuration, { profileSource });
registry.context(); // { schemaVersion: 1, units: 'SI', sessionId, worldEpoch }
registry.list(); // FleetVehicle[] sortat după vehicleId
registry.get(vehicleId); // FleetVehicle | undefined
registry.state(vehicleId); // FleetVehicleState | undefined
registry.addVehicle('TAXI', 'compact', { tick: 12 });
registry.updateState(vehicleId, { tick: 13, controlMode: 'LEARNING' });
registry.removeVehicle(vehicleId); // boolean
registry.counts(); // { vehicles, taxis, civilians }
registry.report(); // FleetPopulationReport
registry.dispose();
```

`parseFleetConfiguration(value)` validează și îngheață configurația. `createFleetRegistry` acceptă date necunoscute, deci validarea nu poate fi ocolită de un apelant JavaScript. `fleetVehicleId` și `fleetClassForSeed` sunt exportate pentru integrări și probe, dar identitatea și clasa rămân definite într-un singur loc.

## Configurație și limite

| Câmp | Regulă |
| --- | --- |
| `schemaVersion`/`units` | exact `1` și `SI` |
| `sessionId`, `scenarioId`, `namespace` | stringuri nenule; namespace-ul intră în identitate |
| `worldEpoch` | întreg sigur nenegativ |
| `seed` | uint32, întreg |
| `taxiCount` | întreg în `[20, 30]` |
| `civilianCount` | întreg în `[20, 40]` |
| `profile` | `{ profileId, versionId }` nenule, profilul comun al orașului |
| `classPlan` | opțional; câte o clasă per vehicul, lungimi egale cu numerele cerute |

Populația totală este plafonată la 70. `addVehicle` păstrează aceleași limite pe tip: al 31-lea taxi sau al 41-lea civil este refuzat cu `Fleet taxi capacity` / `Fleet civilian capacity`. `FLEET_LIMITS` publică limitele, iar `DEFAULT_FLEET_COUNTS` este `{ taxis: 24, civilians: 40 }`.

Clasele sunt citite din catalogul 023 (`VEHICLE_CLASSES`, versiunea `023-mechanics-v1`). `FLEET_CLASS_COMPATIBILITY` este tabelul explicit taxi/civil × sedan/compact; o clasă sau o pereche necunoscută este respinsă. Modulul nu definește clase, mase sau identități paralele.

## Identitate și determinism

Identitatea este `createStableId('vehicle', namespace, [driverKind, slot])`, cu slot pe patru cifre (`0001`). Slotul este semantic (poziția în flotă), nu ordinea unui array; un ID are maximum 256 code units, limita controllerului 024.

Atribuirea clasei este derivată per vehicul:

```typescript
const vehicleSeed = deriveVehicleSeed(deriveScenarioSeed(seed, scenarioId), vehicleId);
const classId = classIds[randomUint32(vehicleSeed, 'fleet-class', 0) % classIds.length];
```

Astfel, aceeași configurație și același seed produc aceeași flotă, iar adăugarea de taxiuri/civili nu reclasifică identitățile existente: un al 30-lea taxi nu schimbă clasele primelor 20 sau 24. `classPlan` înlocuiește explicit atribuirea derivată, fără altă sursă ascunsă.

`list()` sortează după `vehicleId`; raportul are o matrice fixă `driverKind × class`, deci ordinea nu depinde de `Map`, de selecție sau de ordinea de creare.

## Stare per vehicul

`FleetVehicleState` conține exclusiv câmpurile de simulare:

- `tick` — tick-ul ultimei actualizări, monoton per vehicul;
- `controlMode` — `AUTO`/`MANUAL`/`LEARNING` din contractul 024;
- `appliedProfileVersion` — versiunea de profil aplicată vehiculului.

Fiecare vehicul are propriul obiect înghețat. `updateState` validează câmpurile, refuză un tick mai vechi și atinge numai intrarea adresată; nu există un tick global care să rescrie toată flota. Selecția, camera, vizibilitatea și mesh-urile nu fac parte din contract și nu pot schimba starea sau ordinea. Regula „cel mult un vehicul MANUAL/LEARNING” și arbitrajul autorității rămân în input/controller (024/030).

## Profilul comun al orașului

Configurația leagă flota de `profileId`-ul profilului comun. Versiunea aplicată la creare este citită din `CityProfileSource.activeProfile()` când portul este injectat, altfel din `configuration.profile.versionId`. Un vehicul nou primește versiunea activă în acel moment; vehiculele existente păstrează referința până la o actualizare explicită sau la activarea atomică 110. Sursa trebuie să păstreze același `profileId`; o identitate străină este respinsă cu `City profile source identity mismatch`. Registry-ul nu publică, nu activează și nu migrează profiluri.

## Ownership și disposal

Registry-ul deține numai intrările și stările flotei. Nu deține corpuri Rapier, mesh-uri, materiale, listeners sau timere; compoziția lumii și adaptoarele rămân ale composition root. `removeVehicle` eliberează o intrare, iar `dispose()` (idempotent) golește toate intrările și readuce contoarele și raportul la zero. După disposal, mutațiile sunt respinse, iar citirile returnează valori goale/zero.

## Raport

`report()` întoarce `version`, `seed`, `total`, `taxis`, `civilians`, `byDriverKind`, `byClass` și `matrix` (taxi/civil × sedan/compact). Matricea are mereu patru rânduri, inclusiv valorile zero, deci forma raportului este stabilă pentru UI, telemetrie și probe.

## Verificare

`tests/fleet/fleet-registry.test.ts` acoperă: 20/24/30 taxiuri, limitele de civili, unicitatea și stabilitatea ID-urilor, determinismul seed-ului, independența clasei față de mărimea populației, duplicatele, perechile clasă/tip invalide, starea independentă și imuabilă, lipsa câmpurilor de prezentare, legarea la versiunea activă, ownership-ul/disposal-ul la zero și egalitatea raportului comis.

```powershell
npm run fleet:registry
npm run fleet:registry -- --check
```

Runnerul scrie [report.json](Evidence/057-fleet-registry/report.json) și [report.md](Evidence/057-fleet-registry/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație.

## Limite

- Nu creează corpuri fizice, poziții pe bandă, mesh-uri sau rute; acestea aparțin compoziției lumii, 041 și 058.
- Nu implementează dispecerizarea, cursele, ETA, sănătatea flotei sau activarea atomică; 059–065 și 110 rămân contracte separate.
- Nu impune regula unei singure autorități MANUAL/LEARNING; `controlMode` este stare de flotă, arbitrajul aparține 024/030.
- Nu pretinde FPS, GPU, soak sau acceptare hardware; raportul este o probă funcțională deterministă.
