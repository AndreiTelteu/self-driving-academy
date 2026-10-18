# Calibrarea finală a presetului V1 — 031

Presetul mecanic curent este acceptat empiric pentru fixture-urile de calibrare, fără retunarea runtime-ului. [Matricea curentă](Evidence/031-physics-calibration/capture-20261012-r4/matrix.json) conține 120 lumi Rapier reale: 24 referințe 026 reutilizate și 32 scenarii × PLAYER/AUTONOMY/repetare PLAYER. Ambele clase și ambele suprafețe execută frânare 10/20/30 m/s, viraj 8/20 m/s, manevră laterală 8 m/s, bordură 10 m/s și contact între două mașini 10 m/s. Nivelul este `functional`, conform politicii de validare; nu sunt introduse forțe, lucru pe tick sau schimbări vizuale în produs.

## Preset fixat

Babylon rămâne engine-ul de randare. Fizica este Rapier 0.21.0, timestep 1/60 s, solver 8, CCD 4; mecanica `023-mechanics-v1`, suprafețele `026-flat-surfaces-v1`, controller 024 cu opt-in `027-braking-reverse-v1`. Stilul șoferului și preferințele tastaturii nu modifică aceste constante.

| Parametru | sedan | compact |
| --- | ---: | ---: |
| Masă kg |1400|1100|
| Putere W / plafon tracțiune N |90000 /6500|70000 /7000|
| Frână nominală m/s² |8|9|
| frictionSlip dry |1,3|1,5|
| Rază roată / ampatament / ecartament m |0,32 /2,7 /1,8|0,29 /2,4 /1,6|
| Unghi maxim față rad |0,45|0,55|

Forța propulsivă este `min(plafonN, putereW/abs(vLongitudinal))`, cu plafon la zero viteză; frâna este plafonul de impuls per roată `brake×massKg×brakeAcceleration/60/4`. Frâna de serviciu sau de mână domină propulsia. Ground friction dry/reduced este 0,8/0,35; reduced multiplică frictionSlip cu 0,35. Șasiul ambelor clase este cuboid 1,7×0,6×4 m, collider friction 0,5 și restitution 0.

Cele patru roți folosesc rest length 0,35 m, stiffness 35, compression 4,4, relaxation 5,2, travel 0,2 m, plafon suspensie mass×9,81 N și side friction stiffness 1; conexiunea locală y=-0,15 m. Masa, suprafața, geometria și plafoanele aplicate sunt păstrate în readbackul fiecărui scenariu. Valorile frictionSlip/materialului sunt empirice, fără pretenția unui µ de pneu calibrat. Nu sunt simulate ABS, aero, temperatură pneuri sau transmisie completă.

## Măsurători ale jocului

Toate distanțele sunt în metri, după 180 tick-uri de settling și inițializarea explicită a vitezei. Frânarea completă se încheie la viteza totală<0,1 m/s; distanța este lungimea traiectoriei plane pe fiecare tick, fără timp de reacție sau rampă de tastatură. În frânare se cere și throttle 0,4 pentru verificarea dominanței frânei; controllerul realizează throttle 0.

| Clasă / suprafață |10 m/s|20 m/s|30 m/s|
| --- | ---: | ---: | ---: |
| sedan dry |6,092|24,235|53,997|
| sedan reduced |7,297|28,889|64,164|
| compact dry |5,414|21,582|48,162|
| compact reduced |6,731|26,714|59,416|

Virajul ține180 tick-uri un unghi calculat din `atan(ampatament/17)`.17 m este raza geometrică comandată. Raza medie realizată este lungimea traiectoriei plane împărțită la schimbarea cumulată a yaw-ului; este un diagnostic al răspunsului, nu o potrivire circulară exactă în derapaj. Viteza inițială nu este ținută artificial constantă.

| Clasă / suprafață |Rază medie8 m/s|Rază medie20 m/s|Max. viteză laterală roată8→20 m/s|
| --- | ---: | ---: | ---: |
| sedan dry |17,450|29,517|1,068→2,965 m/s|
| sedan reduced |18,911|87,957|1,189→3,077 m/s|
| compact dry |17,405|25,687|0,923→2,616 m/s|
| compact reduced |18,347|76,156|1,050→2,732 m/s|

Manevra laterală cere40 tick-uri de direcție pozitivă,40negativă și 100neutră, throttle 0,15 și semnalRIGHT. Offsetul final dry/reduced este 2,338/2,894 m sedan și 2,251/3,204 m compact; yaw-ul final este 0,031/0,084 rad și 0,022/0,086 rad. Fixture-ul măsoară schimbarea laterală și revenirea direcției; nu certifică achiziția centrului unei benzi de lățime impusă sau un planner de schimbare a benzii.

Bordura statică are înălțime0,18 m, lățime8 m și grosime0,30 m la z=10 m. Contactele native ale roților ating suprafața superioară y>0,17 m; creșterea maximă a înălțimii șasiului față de început este 0,0143 m sedan/0,0144 m compact și toate cele patru contacte revin la final. La această bordură joasă șasiul nu lovește colliderul: impulsul normal collider este 0. Acesta este răspuns de suspensie/raycast, distinct de impactul de caroserie.

Contactul între două vehicule pune o mașină identică staționară la z=12 m și prima la10 m/s. Snapshoturile native păstrează explicit perechea `car|other` și starea ambelor corpuri la fiecare tick. Suma impulsurilor normale ale perechii este 7135,353 N·s sedan și 5606,349 N·s compact pe fiecare suprafață; ambele vehicule au patru contacte cu roțile la final. Suma pe episod nu este energia impactului sau un model complet de accident.

## Paritate, stabilitate și dovezi

Fiecare dintre32 scenarii compară exact toate tick-urile PLAYER versus AUTONOMY și versus o lumePLAYER proaspătă. Trace-ul include comanda efectivă, realizarea drivetrain și inputul fizic semnat, pose/viteză/angular velocity/suspensia/contactele roților, contactele collider și întregul corp secundar. Numai câmpul `command.source` este normalizat; sursa originală rămâne în run și cititorul verifică rolul. Ambele surse primesc aceeași comandă la fiecare tick60 Hz; această probă nu echivalează planificări diferite10 Hz cu input digital filtrat.

Hash-urile trace-ului și comenzilor sunt păstrate per run. Cele 24 referințe reutilizează direct `calibrateWheels` 026 și produc exact aceeași stare finală ca fixture-ul 031 compus prin controller. Cele 96 lumi 031 eliberează toate corpurile/subscriptions/colliderele/stările controllerului și resping citirea tokenului după dispose.

Cititorul independent verifică acoperirea și rolurile, integritatea fiecărui raw gzip, sursele arhivate, artifactul Rapier durabil 026, hash-ul terminalului și absența failure-markerului. Pragurile verifică oprire înainte de1800 ticks, distanță între0,5× și 2,5× referința v²/(2a), aderență redusă cu minimum 5% distanță suplimentară, creșterea distanței cu viteza și frânarea compactului mai scurtă; virajul lent dry are rază15–20 m, iar cel rapid lărgește raza minimum 25% și viteza laterală minimum 50%. Toate stările sunt finite; suspensia rămâne0–0,6 m. Contactul între două mașini cere impuls nativ al perechii împărțit la masa vehiculului >1 m/s, iar bordura cere contact nativ cu partea superioară și revenire la patru roți. Sunt praguri de coerență ale acestui joc, nu certificare auto reală.

Captura curentă folosește Node 24.21.0 pe Windows x64. [Binding](Evidence/031-physics-calibration/capture-20261012-r4/binding.json) fixează SHA256-urile surselor și native; [terminal](Evidence/031-physics-calibration/capture-20261012-r4/terminal.json) fixează matricea. Nu există benchmark CPU/FPS în această captură. Probe browser 026 existente sunt reutilizate pentru randarea aceleiași mecanici, conform [raportului026](Evidence/026-laptop/current-delivery-summary.md); 031 nu revendică un playtest browser nou, tastatură umană, performanța jocului integrat sau gate hardware/release.

Comenzi de reproducere, din rădăcina proiectului:

```powershell
volta run --node 24.21.0 --npm 11.19.0 node --import ./scripts/register-typescript.mjs scripts/calibrate-physics-final.mjs capture-YYYYMMDD-rN
volta run --node 24.21.0 --npm 11.19.0 node scripts/verify-physics-final.mjs Docs/Evidence/031-physics-calibration/capture-20261012-r4 --current
volta run --node 24.21.0 --npm 11.19.0 node --import ./scripts/register-typescript.mjs --test tests/vehicles/physics-calibration.test.ts
volta run --node 24.21.0 --npm 11.19.0 node --test tests/vehicles/physics-calibration-reader.test.mjs
```

Un label nou este obligatoriu; capturile existente nu se suprascriu. Fără `--current`, cititorul verifică arhiva istorică și datele native durabile; cu opțiunea verifică suplimentar bytes-urile curente ale sursei și artifactul instalat. Capturile r1–r3 rămân păstrate: toate au trecut matricea funcțională sub sursa lor; corecția ulterioară a lint-ului și întărirea cititorului sunt descrise în [istoric](Evidence/031-physics-calibration/README.md).

Git păstrează sursele măsurate cu LF prin .gitattributes, inclusiv pe Windows, iar arhivele de dovezi sunt excluse de la conversia newline-urilor. Pe Windows, activează git config core.longpaths true pentru căile arhivelor 026; aceasta este și configurația checkoutului verificat. Hash-urile surselor publicate sunt comparate cu bindingul capturii, fără a modifica arhivele istorice.
