# Clase mecanice 023

Catalogul pur `src/vehicles/vehicle-classes.ts` definește două clase imuabile cu versiunea `023-mechanics-v1`. `addClassCar(id, position, classId, version?)` selectează explicit mecanica; un ID/o versiune necunoscută este respinsă înainte de alocare. Mecanica nu este citită din ControlPreferences sau DrivingProfile și nu este salvată ca preferință. `VehicleState.classId` identifică definiția, fără duplicarea ei în profil.

| Parametru SI | sedan | compact |
| --- | ---: | ---: |
| Masă kg | 1400 | 1100 |
| Putere la roțile motoare W | 90000 | 70000 |
| Plafon forță de tracțiune N | 6500 | 7000 |
| Frână nominală m/s² | 8 | 9 |
| Rapier frictionSlip, empiric | 1,3 | 1,5 |
| Rază roată m | 0,32 | 0,29 |
| Ampatament m | 2,7 | 2,4 |
| Ecartament m | 1,8 | 1,6 |
| Unghi maxim față rad | 0,45 | 0,55 |
| Rază geometrică la full lock m | 5,59 | 3,91 |

Puterea are sens dimensional: la accelerație completă forța totală pe puntea spate este `min(engineForceN, powerW / abs(longitudinalSpeedMps))`. La zero viteză plafonul de forță elimină singularitatea. Inputul throttle scalează această forță și îi dă sensul. Viteza longitudinală este produsul scalar al vitezei curente Rapier cu axa locală +Z transformată de quaternionul curent; după setPose/setVelocity sau impact nu folosim viteza cache-uită de controller din tickul anterior. Două getters WASM suplimentare per mașină cu putere sunt incluse în bridgeCalls. Input lateral nu reduce arbitrar forța longitudinală.

Masa este aplicată colliderului; patru roți raycast primesc raza/ampatamentul/ecartamentul clasei, frictionSlip și suspensia. Frâna păstrează formula calibrată021 a impulsului per roată `brake * massKg * brakeAcceleration / 60 / 4`. Raza geometrică este `wheelbase / tan(steeringRadians)`, referință de geometrie; aderența și inerția determină traiectoria reală. Grip nu este un µ de pneu calibrat. Șasiul simplificat rămâne cuboidul021 de 1,7×0,6×4m pentru ambele clase. ABS, cutie de viteze, aero și temperatură pneuri nu sunt simulate.

Compatibilitatea este explicită: `addCar` fără clasă păstrează `SEDAN` și versiunea021, cu forță constantă6500N, fără limitarea nouă de putere. Cele două clase sunt un opt-in versionat. La primele3s sedanul023 nu atinge încă pragul puterii și coincide cu legacy; la viteze mari plafonul se aplică imediat. `readVehicleMechanics` întoarce copii readonly, masa/raza/poziția conexiunilor/frictionSlip și comenzile roților fiind citite din Rapier real. Puterea și frâna nominală sunt definiții ale controllerului, nu getters fictive de motor.

Caps021/022 rămân1world,110vehicule,96obstacole,207corpuri,256collidere,8subscriptions/body și880total. Catalogul are2intrări, fără istoric/cache nelimitat. Readbackul mecanic produce cel mult4forțe și4unghiuri numai la cerere; nu se apelează implicit pe tick.

Pe aceeași suprafață plană, după180ticks settling,180ticks accelerație dau13,5253m/s sedan și16,4113compact; frânarea20m/s până la<0,1m/s dă24,2350m versus21,5823m. Virajul8m/s cu steering0,35 timp180ticks dă(x,z)=(14,1785,15,9984)m versus(16,1970,11,2802)m. `tests/vehicles/vehicle-classes.test.ts` verifică aceste diferențe, regresia legacy exactă, puterea la primul tick după+90Y și mers invers, native mass/wheels și20cycles110cars/880subscriptions.

Probe desktop și limite: [evidence](Evidence/023-vehicle-classes/progress.md). Fixture-ul producție dedicat `node tests/browser/vehicle-classes/server.mjs 5193` permite replay vizibil și5perechi default/mixed70cars cu30s warmup/120s măsurare per braț. Ambele brațe livrează aceleași subscriptions022; parametrul schimbat este mecanica. Mixed recreează70cars înainte de warmup, iar obstacolele rămân cele64debris/3bariere; ordinea nativă a inserării diferă și este parte din fixture. Nu pretindem gameplay/laptop/gate224 validate prin probele timpurii.

Probe headed Chrome complete WebGPU și WebGL2 pe AMD Radeon RX7900XTX au trecut verificatorul curent și istoric: [raport și protocol](Evidence/023-vehicle-classes/README.md). Fiecare backend are10brațe30/120 și20cyclescleanup; medianaframep957ms. Varianta mixtă adaugă≈0,1ms medianmain/thread și0–0,1ms tick față de default, fără regresie confirmată >10% și >1ms în3/5brațe față de baseline022. Nativewindowrestored a fost verificat înainte de fiecare full; probele invalide cu fereastră minimizată sunt păstrate separat, fără schimbarea pragului250ms sau timestepului.
