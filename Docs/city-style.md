# Stilul comun al orașului: taxiuri și civili (PBI208)

Contract: `208-city-style-v1`. Harness offline, determinist, fără UI, browser, Rapier, renderer sau
ceas de perete. Codul trăiește în `src/app/city-style-propagation.ts`; proba este
`npm run city:style`.

Modulul leagă modulele reale deja livrate într-o singură sesiune: registry-ul 057 (taxiuri plus
civili), activarea 110 la tick comun, traficul civil 058 peste plannerul real 041 și lanțul
044/046/047/048, pipeline-ul 112 cu outcome 103 injectat și țintele de stil 106. Nu creează un al
doilea profil, un al doilea publisher sau o a doua coadă.

## Profilul comun

Există un singur profil de stil al orașului. Valorile de bază sunt valorile reale 092, iar cele 24 de
chei țintă sunt cele ale profilului 105 `PRUDENT`, citite prin 106 (`CAUTIOUS`). Candidatul învățat
este tot o țintă 105, `IMPULSIVE` (`ASSERTIVE`), deci diferența de stil nu inventează o valoare.

O publicare 110 creează o singură comandă `PENDING` pentru un tick viitor. Înainte de tick nu se
scrie nimic: histograma de versiuni rămâne identică. La tick toate vehiculele existente primesc
aceeași referință și același tick. După tick histograma are exact o cheie.

## Ambele categorii

Taxiurile și civilii sunt tratate identic. `driverKind` rămâne doar o etichetă de context: nu
filtrează planul, nu schimbă versiunea și nu produce un profil separat. Sunt incluse vehiculele
`MANUAL`, `LEARNING`, selectate, ascunse sau conduse de jucător; selecția și vizibilitatea sunt
stare de prezentare și nu există în contractul 057 (`FLEET_VEHICLE_FIELDS`/`FLEET_STATE_FIELDS`).

## Vehicule create ulterior

Registry-ul construit cu sursa scrisă de 110 citește ținta curentă la fiecare `addVehicle`:

- un vehicul creat cât timp comanda este `PENDING` primește versiunea în așteptare;
- un vehicul creat după `APPLIED` primește versiunea activă;
- nu este nevoie de o a doua activare.

Regula este aceeași pentru `TAXI` și `CIVILIAN`; nu există o hartă de versiuni pe tip.

## Rutele și limitele civililor

O schimbare de stil nu atinge ruta, banda, clasa mecanică sau limitele 023. Pentru fiecare civil,
amprenta rutei (path 041, origine, destinație, cost, versiuni) rămâne byte-identică, iar amprenta
mecanică (masă, putere, frână, aderență, viraj, plafoane 085) rămâne neschimbată. Singura suprafață
scrisă de activare este `{ tick, appliedProfileVersion }`.

Traficul civil 058 păstrează propriul bundle compilat. Composition root trebuie să apeleze
`refreshStyle()` după o activare `APPLIED` și înainte de următorul pas 60 Hz; `refreshStyle()` în
timpul stării `PENDING` ar adopta prematur ținta în așteptare. `resume` recitește aceeași versiune
activă și păstrează ruta.

## MANUAL

Un segment `MANUAL` observat de un civil este `SKIPPED_MANUAL` cu motivul
`MANUAL_SEGMENT_NOT_LEARNABLE`: nu produce job 103, versiune 109 sau comandă 110. Civilul rămâne
`MANUAL`, primește referința comună la tickul normal și își păstrează ruta. La revenirea în `AUTO`,
ruta rămâne aceeași, iar versiunea activă este recitită.

## LEARNING eligibil

Un segment `LEARNING` eligibil observat de un civil intră în pipeline-ul real 112 și produce exact o
versiune 109, care este publicată în 110 la tickul următor. Ambele categorii adoptă aceeași versiune:
histograma taxiurilor și histograma civililor au aceeași singură cheie. Modul `LEARNING` al civilului
este păstrat, iar ruta rămâne neschimbată.

## Fără profil ascuns

Nu există profil per jucător, per clasă, per tip de șofer sau personalitate derivată din clasă.
Fiecare vehicul păstrează `profileId`-ul comun și `classVersion` 023; numai
`appliedProfileVersion` evoluează. Raportul publică `hiddenOverrides: []` și verifică absența
câmpurilor de prezentare în contractul flotei.

## Ce nu este

- Nu este un test de gameplay, browser, FPS/GPU sau hardware.
- Nu este worker-ul 103, estimatorul, store-ul sau un al doilea publisher.
- Nu atinge fizica, rutele, cursele, pozițiile ori selecția.
- Nu schimbă registry-ul 092: proiecția `DrivingProfile` a unei versiuni 109 marchează valorile
  `BASE`, pentru că `estimable` rămâne `false` pentru toate cheile.
- Nu certifică performanța jocului integrat.

## Verificare

`tests/app/city-style-propagation.test.ts` conține 17 teste de contract. `npm run city:style`
produce 7 scenarii și 71/71 verificări, iar `npm run city:style -- --check` verifică faptul că
raportul salvat este actual. Raportul este
[Docs/Evidence/208-city-style/report.json](Evidence/208-city-style/report.json), cu tabelul uman în
[report.md](Evidence/208-city-style/report.md).
