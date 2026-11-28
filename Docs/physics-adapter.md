# Adaptor fizic 022 — implementat și verificat pe desktop

`vehicles/index.ts` păstrează contractele pure ale domeniului; singura intrare async care atinge Rapier este `createLiveVehiclePhysics` din `rapier/live.ts`, fără obiecte native publicate. `body-port.ts` definește PhysicsBodyPort, BodyIdentity, BodyState și sink-ul injectat PhysicsScenePort; `body-registry.ts` gestionează numai înregistrările active. `rapier/index.ts` implementează portul pe corpuri Rapier reale, fără obiecte native publicate. Nu există import Babylon/rendering în domeniu, nici modificări rendering.

## API și coordonate

- `bodyIdentity(entityId)` și `entityForBodyHandle(handle)` întorc același token readonly al înregistrării active.
- `readBody(token)` produce copie readonly SI: transform.positionM, rotationQuaternion și velocityMps.
- `setPose(token, transform)` validează întreaga poziție/rotație înainte de setters. `setBodyVelocity(token, velocityMps)` aplică viteza SI.
- `removeBody(token)` invalidează subscriptions/mapările înainte de removeVehicleController/removeRigidBody. Rapier elimină colliderele atașate; registry-ul colliderelor pentru contact este curățat. Repetarea sau tokenul stale întorc false.
- `subscribeBody(token, callback)` întoarce unsubscribe idempotent. `publishBodies(tick, measure?)` face readback separat de dispatch sincron și întoarce readbackMs/dispatchMs/bodies. Composition root publică explicit după pasul fizic, la tick autoritar; `step`021 nu publică implicit și își păstrează metricile/semantica.
- `connectPhysicsBodyToScene(port, token, sink, context)` copiază contextul sessionId/worldEpoch la conectare. Sink-ul structural poate fi BabylonSceneAdapter013, injectat de composition root. Callerul deține scena și reprezentările și le elimină separat.
- `bodyResources()` raportează entități/subscriptions active, inclusiv zero după dispose; counts021 continuă să raporteze corpurile/colliderele fizice și respinge accesul după dispose.

Metri, m/s, Y-up, +Z înainte, +X dreapta; quaternion xyzw copiat fără mirror, normalizare sau schimbare de semn. +90°Y duce +Z în +X în matricea Babylon. Conversia nu deduce orientarea din velocity și nu mută starea callerului. Proiecția CarProjection și API-ul addCar/addBox/setVelocity021 rămân compatibile.

## Identitate, limite și ownership

Mappingul022 acoperă maximum **110 vehicule addCar**. `addBox` rămâne helper anonim compatibil al fixture-ului021, plafonat la96 obstacole; nu pretindem entity mapping pentru toate cele207 corpuri, decor destructibil ori gameplay023. Caps fizice rămân207 bodies/256 colliders și o lume, cu admitere înainte de alocare. Crearea vehiculului are rollback pentru erori la collider/controller/configurare.

Handle Rapier este number opac finit, poate fi fracționar sau subnormal; nu este safeInteger și nu este ID autoritar serializabil. Tokenul este verificat prin referința exactă a înregistrării, plus generație monotonă sigură locală, fără istoric de entități eliminate. Tokens copiate/forged, din altă lume sau înainte de remove/recreate sunt respinse. Lookup pe handle este numai pentru înregistrarea curentă; consumatorii asincroni păstrează tokenul original, nu refac lookup după întârziere.

Maximum8 subscriptions/body și880 total. Remove/dispose golește seturile și mapările; unsubscribe vechi operează numai pe setul vechi și nu scade contorul noii înregistrări. Dispatch are snapshot plafonat de callbacks și verifică înaintea fiecăruia tokenul identității, membership-ul și tokenul publicației. Fiecare publish acceptat înlocuiește tokenul publicației cu un obiect nou, fără istoric reținut. Și publishBodies are token de batch: o publicație reentrantă oprește batch-ul exterior înainte să livreze snapshoturi vechi ale altor corpuri. Remove/recreate, tick mai nou și **același tick reentrant** sunt fenced. Tick mai mic este respins; același tick este permis pentru reaprezentare013. Callback-urile sunt sincrone, trebuie să fie scurte și să termine recursionarea; excepția callerului se propagă și oprește dispatch-ul, fără rollback al fizicii.

Dispose este idempotent și invalidează registry-ul înainte de eliberarea lumii. Registry-ul nu păstrează tombstones, arrays de istoric sau listeners pentru corpuri eliminate. Scratch-ul publicării are maximum110 stări și8 callbacks/body; nu este un recorder. Estimarea WASM021 rămâne estimare de ownership, nu RAM exactă.

## Verificări executate

`tests/vehicles/body-registry.test.ts` verifică caps, handles fractionale/subnormale, token copiat/stale, unsubscribe după reuse, tick reentrant și conversia defensivă. `physics-adapter.test.ts` folosește Rapier real + Babylon Matrix pentru pose translatat/+90°Y și velocity, apoi20 cicluri la110 vehicule/880 subscriptions, cleanup native și stale token din altă lume.

Fixture-ul `tests/browser/physics-adapter/` și serverul `scripts/physics-adapter-server.mjs` au executat cinci perechi complete direct/bridge pe Chrome headed real, WebGPU și WebGL2, cu30s warmup/120s măsurare per braț și20cycles/backend. npmcheck316teste PASS; verificatorul surselor/artefactelor, bugetelor/regresiilor și cleanupului PASS. Medianele bridge p95:frame7ms, tick2,3ms, physics-step1,7ms pe ambele backenduri; readback/dispatch0,1ms fiecare. Dovezi, identitate, hardware și limite: [verification](Evidence/022-physics-adapter/verification.md), [summary](Evidence/022-physics-adapter/summary.json). Acesta este un adaptor timpuriu validat pe desktop; jocul complet și laptopul rămân NOT_VALIDATED.

Butonul calibration păstrează corpul/mesh-ul vizibil, +90°Y la(7,3,-11), velocity(12,-2,4), fără pas fizic în această probă statică. HUD-ul afișează readBody, matricea mondială Babylon și punctul local+Z transformat≈(8,3,-11); camera țintește corpul. Butonul remove/recreate verifică tokenul și callback-ul vechi și păstrează noul vizual. SMOKE este opt-in,1s warmup/3s măsurare și o pereche, cu fixtureVersion-SMOKE distinct; nu validează steady-state. Implicit sunt5 perechi30s/120s. POST/export este plafonat2MiB, verifică source/commit/budget/engine/physics/artifactHash și hardware.json curentCIM, persistând numai fișiere fixe WEBGPU/WEBGL2, distincte pentru smoke. Manifestul are hashurile fiecărui fișier Vite emis și artifactHash agregat; sourceHash urmărește closure-ul importurilor locale executabile ale fixture-ului, excluzând declarațiile type-only, plus packages/lock/budgets. Nu îngheață întregul src sau module fără dependență executabilă din fixture.

## Integrarea live 282

`createLiveVehiclePhysics` din `src/vehicles/rapier/live.ts` este unicul proprietar live al unei lumi Rapier. El este exportat prin `vehicles/index.ts` ca intrare async explicită și nu publică obiecte native. Adaptorul refolosește:

- `PhysicsProbe` 022 pentru corpuri, roți, suspensie, contacte și readback SI;
- `createVehicleController` 024 cu `027-braking-reverse-v1` și `029` availability;
- `createCollisionEpisodes` 028 pentru incidente din impulsul normal nativ;
- `createVehicleDamage` 029 și `createRecoveryLedger` 030 pentru daune, istoric și recuperare;
- `PhysicsRecoveryPort` 030 pentru `inspectPlacement`/`applyPlacement`, cu poziție yaw-only, viteză zero și operație etichetată `TELEPORT`, exclusă din learning.

Compunerea are două corpuri dinamice reale pentru taxiul și civilul seed și creează un corp Rapier pentru orice actor 058 preluat. Restul flotei 058 rămâne proprietatea rutelor 058 și este reprezentat prin collidere cinematice stabile, nu printr-o a doua simulare. Cele 90 de amprente de clădire sunt obstacole 028 numite, deci impactul cu o clădire produce contact solver și incident 029 real. Decorul 026 rămâne rezolvat de `VehicleCollisionWorld` după pasul nativ, ca plasă de siguranță pentru formele non-convexe care nu încap în plafonul de collidere.

`walking-composition.ts` primește opțional portul physics. Fără el, fixture-ul 236 rămâne cinematic. Cu el, `driveVehicle` nu mai scrie poziția: comanda PLAYER este trimisă la singurul pas fizic al tick-ului, iar comanda AUTONOMY provine din același `VehicleAutoDrive` (avansat cu viteza măsurată) și trece prin același controller. `stepLivePhysics` citește înapoi poziția/viteza/yaw-ul, proiecțiile roților și availability; rendererul aplică rotația/steering-ul roților. Schimbarea modului păstrează corpul, iar preluarea unui vehicul creează corpul la poziția/viteza/yaw-ul exacte.

Rezultatele măsurate sunt în [Evidence/282-live-physics](Evidence/282-live-physics/README.md): paritate PLAYER/AUTONOMY exactă pe420 tick-uri, frânare sedan24,556m vs compact22,550m de la20m/s, viraj mai strâns pentru compact, contact real cu gap3,897m și daune pe ambele clase, recuperare COMPLETED cu viteză zero și istoric 029/030, schimbare de mod fără salt și probă Chrome10/10. Pasul Rapier live are p95 0,367ms în raportul determinist și 0,7ms în Chrome; tick-ul de compunere are p95 4,158ms față de baseline-ul pereche 3,886ms pe fixture-ul normal V1, cu0,272ms incremental. Limite: proxy-urile 058 sunt cinematice până la 284, decorul rămâne resolver 026, iar targetul desktop de5,5ms este raportat separat de bugetul fixture-ului normal V1 (8ms).
