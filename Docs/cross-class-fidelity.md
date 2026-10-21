# Fidelitate între clase și condus liber — PBI 106

Contract: `106-cross-class-fidelity-v1`. Adapter de raport: `106-cross-class-fidelity-app-v1`.
Harness offline, determinist, fără UI, worker, publicare de profil, scriere în store sau mutare de
flotă. Codul trăiește în `src/experiments/cross-class-fidelity.ts`, iar adaptorul de raport în
`src/app/cross-class-fidelity.ts`.

## Ce dovedește

Același stil intenționat, demonstrat pe două clase reale 023 cu plafoane mecanice diferite, produce
aceeași estimare normalizată, păstrează aceeași ordine între stiluri și nu copiază capacitatea
mecanică în profilul comun. Un segment `MANUAL` sau unul `LEARNING` neeligibil nu schimbă profilul;
un `LEARNING` eligibil produce doar un candidat, legat de dovezile reale. Comportamentele pe care
țintele de învățare nu le pot reprezenta sunt raportate explicit ca `UNREPRESENTABLE`.

## Normalizare, nu comparație de capacități

Pentru fiecare stil (`CAUTIOUS`, `ASSERTIVE`) se folosesc țintele explicite ale profilelor 105
`PRUDENT`, respectiv `IMPULSIVE`, restricționate la cele opt chei normalizabile între clase:
`speed_delta_urban`, `speed_delta_residential`, `curve_lateral_accel`, `intersection_approach_speed`,
`desired_acceleration`, `comfort_deceleration`, `acceleration_jerk`, `brake_reaction_delay`.

Generatorul transformă ținta de stil într-o fracțiune adimensională față de plafonul sedanului de
referință și apoi înmulțește fracțiunea cu plafonul **clasei curente**. Astfel:

- cererea brută în SI diferă între `sedan` și `compact`, pentru că plafoanele 023 diferă;
- `createVehicleNormalizer` (089) împarte exact aceeași diferență la plafonul propriei clase;
- estimatorul 095 citește fracțiunea normalizată și o raportează pe referința sedan, deci aceeași
  intenție produce aceeași estimare longitudinală.

Nu se compară niciodată direct accelerația, decelerația sau accelerația laterală brută a celor două
clase. Raportul publică separat `mechanical` (plafoane, p50 brut în SI, p50 normalizat) și
`normalized` (estimările de stil), ca un cititor să vadă unde s-a împărțit capacitatea.

Singura excepție documentată este `curve_lateral_accel`: estimatorul 094 reconstruiește candidatul
lateral cu plafonul clasei observate, nu cu referința sedan. De aceea raportul păstrează diferența
reală dintre clase pe această cheie și folosește toleranța 106 mai largă
(`0.25 + 0.20 × |target|`), nu toleranța inversă 105. Diferența este raportată, nu ascunsă.

## Tendință versus capacitate

Pentru fiecare cheie de tendință, ordinea documentată este `CAUTIOUS < ASSERTIVE` pentru cheile de
viteză/accelerație și `CAUTIOUS > ASSERTIVE` pentru `brake_reaction_delay`. Raportul verifică ordinea
separat în `sedan` și `compact`; `trendPreserved` este adevărat numai dacă ambele clase o păstrează.

`normalizedAgreement` compară estimarea normale a aceleiași ținte între clase, cu o toleranță
explicită per cheie. Șapte chei refolosesc limita documentată 105
(`absolute + relative × |target|`); cheia de curbă are toleranța 106 justificată mai sus. Nicio
toleranță nu este o valoare implicită comună.

Regula de copiere mecanică: o valoare din profilul comun care este egală (în `1e-6`) cu un plafon
mecanic al unei clase sau cu p50-ul brut al clasei non-referință este un eșec
`MECHANICAL_CAPABILITY_COPIED`. Profilul nu are voie să transforme o limită mecanică într-o
preferință. Un override injectat cu plafonul sedanului este detectat și face raportul `FAIL`.

## Profilul comun

Profilul comun al fiecărui stil este derivat din rularea de referință `sedan`, pentru că 095
raportează deja cererea longitudinală pe referința sedan. Aplicarea lui pe `TAXI` și `CIVILIAN`
produce exact același set de parametri, pentru ambele clase reale, fără niciun override mecanic
specific clasei. Compatibilitatea este citită din contractul real 057 (`fleetClassCompatible`); nu se
creează și nu se mută nicio flotă.

## MANUAL versus LEARNING

`evaluateModeFidelity({ mode, eligible, sameRoute })` construiește aceeași rută și aceleași
observații pentru ambele moduri când `sameRoute` este adevărat. Starea fizică publicată conține
digestul rutei și digestul observațiilor, derivate din stil/clasă/scenariu, nu din mod.

- `MANUAL`: `profileChanged: false`, `candidate: null`, `versionId: null`, `delta: null`, motiv
  `MANUAL_NO_LEARNING`. Poarta reală 103 (`parseLearningJob`) respinge jobul cu
  `MANUAL_SEGMENT_NOT_LEARNABLE`.
- `LEARNING` neeligibil: aceleași valori nule, motiv `INELIGIBLE`; poarta reală răspunde
  `SEGMENT_INELIGIBLE`.
- `LEARNING` eligibil: estimatorul real 095 produce candidatul, iar `blendProfileValue` (101) produce
  un delta în memorie legat de read model-ul 093 (`READY`, patru episoade). Rezultatul are
  `profileChanged: true`, candidat, `versionId` de candidat și `published: false`; nu se publică și
  nu se scrie în store.

## Comportamente nereprezentabile

Setul este închis: `PASSENGER_MODIFIER`, `HAZARD_AVOIDANCE`, `OFF_ROAD`, `EXTERNAL_COMMAND`.
Fiecare are `result: 'UNREPRESENTABLE'`, `estimate: null`, `key: null`, `value: null`, un motiv și un
detaliu. Raportul include o manevră în afara scopului — `EVASIVE_SWERVE_AROUND_HAZARD` — în aceeași
stare; faptul că ruta este măsurabilă nu inventează o cheie sau o valoare.

## Verificare

`npm run learning:cross-class` produce 47/47 verificări, 7 scenarii și `overall PASS`; scrie
`Docs/Evidence/106-cross-class-fidelity/report.json` și `report.md`. `--check` verifică faptul că
raportul salvat este actual. `tests/experiments/cross-class-fidelity.test.ts` conține 18 teste de
contract. Vezi [Evidence/106-cross-class-fidelity](Evidence/106-cross-class-fidelity/README.md).

## Ce nu este

- Nu este un test de gameplay, browser, FPS/GPU sau hardware.
- Nu este worker-ul 103, store-ul de profil, publicarea 110 sau o flotă reală.
- Nu inventează valori pentru chei neidentificabile și nu declară `LEARNED`.
- Nu schimbă `implemented`/`estimable` din 092 și nu modifică modulele 089, 094–096, 023 sau 057.
- Nu pretinde că stilul estimat este sigur sau conform; un stil agresiv poate rămâne valid numeric.
