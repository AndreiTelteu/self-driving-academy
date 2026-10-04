# Adaptor de scenă Babylon (PBI013)

`BabylonSceneAdapter` este exportat din `src/rendering/babylon`. Constructorul primește scena backendului 011 și `{ sessionId, worldEpoch }`; nu deține engine-ul, camera sau scena. Backendul rămâne neschimbat. Composition root poate crea adaptorul după backend și trebuie să-l elibereze înaintea backendului. Nu există mesh-uri de gameplay adăugate la bootstrap.

## API și identitate

- `create(entityId, representation, transform)` creează un `TransformNode` dedicat sub `adapter.root`; întoarce acel nod stabil.
- `getNode(entityId)` întoarce nodul împrumutat pentru citire; `size` numără entitățile active.
- `replace(entityId, representation)` schimbă numai subarborele vizual. Nodul entității, poziția, quaternionul și ultimul tick rămân aceleași.
- `updateTransform(entityId, transform)` primește forma existentă `VehicleState.transform`: `positionM` și `rotationQuaternion`. Composition root poate furniza transformări interpolate; adaptorul nu produce tick-uri sau interpolare.
- `presentVehicle(state)` primește proiecția readonly `VisualVehicleState` din contractul public `vehicles`: vehicleId, sessionId, worldEpoch, tick, transform. Returnează false pentru identitate expirată sau tick vechi. ID-ul necunoscut și datele invalide produc eroare înaintea modificării pose-ului.
- `entityIdFor(node)` urcă până la nodul entității; funcționează pentru descendenți și respinge noduri străine/disposed. Nu produce comenzi de selecție sau UI.
- `remove(entityId)` întoarce false dacă ID-ul lipsește; repetarea este sigură. `dispose()` este idempotent.
- `reset(identity)` elimină entitățile și istoricul tick-urilor. Cere alt sessionId sau worldEpoch strict crescător în aceeași sesiune.

Pose-urile nu sunt mutate sau normalizate. Validarea locală de prezentare acceptă numai numere finite, quaternion normalizat (toleranță 1e-6), ID-uri ne-goale și tick/epoch întregi nenegativi. Importurile domeniului sunt exclusiv `import type` prin entry point public; nu există dependență de serviciul fixed-tick 008.

În același epoch, istoricul ultimului tick acceptat este păstrat după remove: un ID reutilizat cere un tick strict mai nou. Înregistrările active acceptă și reaprezentarea aceluiași tick. Istoricul este plafonat la 4096 identități prezentate, configurabil prin al treilea argument pozitiv al constructorului; la capacitate o identitate suplimentară produce eroare fără modificări. Numai resetul explicit al lumii sau dispose golește istoricul, fără a elimina tacit protecția stale.

## Coordonate

Convenția este **Y-up, metri, left-handed, +Z înainte, +X dreapta**. Scenele right-handed sunt respinse; adaptorul nu schimbă configurația unei scene existente. Quaternionul xyzw se copiază exact; +90° în jurul Y transformă +Z în +X. Rădăcina scenei și nodul entității au pivot zero și scară unitară. Pivoturile/scara/offseturile de asset rămân în reprezentarea copil; originea domeniului nu depinde de pivotul mesh-ului. Fixture-ul verifică matricea mondială și un pivot local nenul.

## Ownership și înlocuire

`VisualRepresentation` conține un root `TransformNode`/mesh și liste opționale `ownedMaterials`, `ownedTextures`. Root-ul și toți descendenții trebuie să fie TransformNode/mesh-uri vii, detașați de alte rădăcini, din aceeași scenă. Camerele/luminile/audio/observers externi nu sunt gestionați de acest contract. Listele sunt copiate la adoptare; callerul nu poate schimba ulterior ownership prin mutarea array-ului inițial.

Ownership-ul nodurilor se transferă numai după adoptare. Nodurile returnate și reprezentările adoptate sunt împrumutate: callerul nu le reparentează, nu le distruge și nu schimbă pivotul/scara nodului entității. Resursele listate sunt exclusive: nu le atribui altor mesh-uri după adoptare. Materialele/texturile omise sunt partajate și rămân în ownership-ul callerului. Materialele exclusive trebuie să fie materiale înregistrate în `scene.materials`; MultiMaterial nu este acceptat de acest contract timpuriu. Și materialele/texturile împrumutate referite de mesh-uri trebuie să fie vii și locale scenei.

Se resping ID-uri duplicate, subarbori deja adoptați, root-uri disposed/foreign/atașate, resurse duplicate/străine/disposed și resurse exclusive referite din altă reprezentare. Validarea candidatei se termină înaintea schimbării reprezentării existente. La respingere vechiul vizual și pose-ul rămân intacte, iar candidata rămâne în ownership-ul callerului, care trebuie s-o curețe. API-ul primește resurse deja create; nu administrează factories/loaders care pot eșua parțial.

La succes candidata este atașată sub același nod stabil, apoi vechiul subarbore este disposed. Disposal-ul nodurilor nu cascadează în materiale/texturi; resursele exclusive sunt eliberate separat, fără cascada material→texture. Geometriile mesh-urilor urmează refcount-ul Babylon. Resursele partajate sunt eliberate de caller după ultimul consumator. Nu există asset registry, loader sau selecție completă 014/017.

## Verificare și limite

Fixture browser: `/tests/browser/scene-adapter/`, module `main.ts`: `lifecycleProbe('AUTO'|'WEBGL2', keep?)`, `newCostProbe(...)`; `baseline.ts`: `bootstrapProbe(...)`. `keep=true` păstrează calibrarea vizibilă și întoarce cleanup explicit `dispose`. Box-urile există numai în fixture.

[Dovezile](Evidence/013-scene-adapter/report.md) includ backenduri reale, 20 de cicluri fiecare, resurse partajate, eșec atomic de validare, identități stale/reutilizare, input readonly, calibrare, baseline înainte/după și cost nou separat. Contoarele Babylon nu reprezintă memorie GPU exactă. Bugetele sunt provizorii înainte de 203; fixture-ul dev timpuriu nu închide gate-ul de performanță al jocului complet.

