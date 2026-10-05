# Prototipul de fizică 021

Babylon.js rămâne engine-ul pentru scenă, cameră și randare. Fizica folosește Rapier3D0.21.0 fixat exact în package-lock, reverificat la5octombrie2026 în [pachetul oficial](https://www.npmjs.com/package/@dimforge/rapier3d-compat). [Controllerul oficial](https://rapier.rs/docs/user_guides/javascript/vehicle_controller/) folosește patru raycasts și un singur corp pentru șasiu; roțile nu sunt corpuri fizice. Decizia prototipului este continuarea cu Rapier raycast pentru fundația controllerului, cu limitele de anvelopă documentate aici. Integrarea în joc, clasele de vehicule, filtrarea tastaturii, arbitrajul VehicleCommand și learning rămân în PBI-urile următoare.

`src/vehicles/physics.ts` definește portul SI, configurația `021-raycast-v1`, comenzi și proiecții readonly. Entry point-ul vehicles exportă numai contractele pure. Adaptorul `src/vehicles/rapier/index.ts` deține corpurile/colliderele/controller-ele și nu publică obiecte Rapier. Proiecțiile sunt copii înghețate, configurarea este copiată, batchul de comenzi se validează integral înainte de mutație, iar dispose este idempotent. Excepția arhitecturală permite exact importul static `@dimforge/rapier3d-compat` în acest fișier; trei probe negative îl resping din contracte, simulation și alt fișier al adaptorului. Restricțiile DOM/Babylon/cicluri rămân active.

## Configurație și admitere

Un singur world activ; maximum110vehicule,96obstacole,207corpuri și256collidere. Depășirea este respinsă înainte de creare. Colliderul solului este numărat. Un vehicul folosește cuboid1,7×0,6×4m, masă1400kg, patru roți cu rază0,32m și ampatament2,7m. Bordura are18cm; wall-ul CCD are10cm grosime. Geometria vizuală nu generează automat collidere.

Configurația rezervă estimarea de admitere32MiB pentru o lume WASM și maximum4096bytes pentru scratch query. Acestea sunt bugete de ownership/configurație provizorii, nu măsurători ale allocatorului și nici garanții ale heapului browserului. Capul world=1 limitează rezervarea. Ray-ul este reutilizat și există maximum110query-uri explicite/tick; nu se alocă un array cu vecini neplafonat. Public API folosit nu expune memoria exactă WASM, care rămâne unavailable. Nu însumăm estimarea cu backing buffers drept RAM totală. Aceste caps nu certifică220/224 sau distrugerea227.

Pasul este60Hz, dt=1/60s, solver8, CCD4 și CCD activ pe toate corpurile dinamice. Setările nu depind de FPS/cameră. Sleeping-ul rămâne fizic; comenzile nenule reactivează corpul. Query-urile exclud senzorii, fără excluderea mașinilor/debris. Toate mașinile fixture-ului sunt actualizate, inclusiv în afara camerei.

## Calibrare și limite

`node --import ./scripts/register-typescript.mjs scripts/calibrate-physics.mjs` salvează curbele la0,1s în `Evidence/021/calibration.json`. După3s settling se setează viteza SI și se frânează până la<0,1m/s. Grip1,3 și brake8m/s² dau6,09/24,24/54,00m de la10/20/30m/s. Dublarea vitezei produce≈4× distanța. La20m/s, brake4m/s² produce47,48m, iar grip0,6 produce26,47m. Grip este parametrul empiric Rapier frictionSlip, nu un coeficient µ calibrat direct.

Virajul aplică0,1575rad la roțile față; raza geometrică≈17m este referință, nu traiectorie impusă. Curbele pentru8/20m/s și două grip-uri includ poziția, viteza și viteza laterală. La viteză mare modelul pierde viteză și își schimbă traiectoria. Viteza laterală nu crește monoton cu frictionSlip; controllerul nu modelează explicit pneul, temperatura, ABS sau curba slip angle. Calibrarea finală trebuie să păstreze aceste limite și să testeze două clase înaintea extinderii.

Bordura produce excursie verticală măsurată; wheel rays pot trece peste ea fără contactul cuboidului. Auto-auto are contacte solver și transfer de mișcare către țintă. Proba45m/s în wall subțire verifică CCD fără trecerea șasiului prin wall. Șase teste verifică aceste mecanici, admiterea și exact aceeași proiecție după300tick-uri la30/60/144FPS.

## Browser și măsurare

`./scripts/Run-PhysicsProbe.ps1 -Port 5191` construiește fixture-ul producție și capturează CIM/alimentare. Chrome local headed este autorizat explicit; tabul rămâne vizibil/cu focus. Fixture-ul permite manual cu săgeți, frânare20m/s, viraj, bordură, contact și slidere grip/brake cu reset explicit. Schimbarea sliderului modifică vehiculul numai la reset.

Proba completă are cinci perechi collector218 oprit/pornit, ordine alternată, minimum30s warmup și120s măsurare/braț. Lumea70cars+64debris+3barriers+ground se recreează între brațe:134corpuri/138collidere. Comenzile împing cozi în bariere pentru contacte persistente. Babylon afișează șasiurile/barierele; debris sunt corpuri fizice fără mesh în acest fixture. Smoke1s/3s nu validează steady-state.

Raportul218 este extins prin physicsRuns: pas world.step, controller inclusiv comenzi/raycasts interne,70query-uri explicite și readback bridge. `representativeBridgeCallsPerTick=1610` numără12setters+11getters/car; exclude updateVehicle, castRay, translation pentru query, world.step, proiecții vizuale și query-uri de contacte. bridgeReadback măsoară11getters/car reprezentativi, nu toate trecerile JS/WASM. Timpul total tick include validarea, controller, pas, query și readback; main-thread/frame includ proiecțiile, renderul și observerul de contacte1Hz.

Bufferul comun este1.344.000bytes:60.000mostre CPU/cadru și4×12.000mostre fizică. Colectorul218 rezervă separat5.280.044bytes în brațul activ. Overflow respinge raportul. GPU timer și memoria exactă sunt unavailable. Pierderea focusului/visibility/GPU invalidează proba; Long Tasks raportează suport/count/max real. Inițializarea fizicii este păstrată separat, cu module/WASM deja warm după calibrarea manuală; nu este cold navigation/cache controlat.

Baseline-ul anterior este copia byte-identică `Evidence/021/pre-physics-218-baseline.json`, cu identitatea originală218. Măsoară kernelul gol, fără fizică.021 separă costul nou și overheadul observatorului. Nu se schimbă baseline-ul203 sau pragurile retroactiv. [Verificarea021](../Evidence/021/verification.md) păstrează rezultatele desktop, notele browser și limitările. Acestea nu sunt test laptop, workload de joc complet sau gate final de release.
