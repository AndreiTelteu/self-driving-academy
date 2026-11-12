# 165 — pericole, obstacole și claxon

PBI 165 adaugă stimuli de pericol observabili, obstacole ca date și oportunități de claxon. Contractul
este [`165-hazards-v1`](../../../src/world/hazards.ts); raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

Regula oracolului: un stimul există numai când pericolul este observabil (în rază și în conul frontal);
o reacție este numai un front după debut, nu o stare deja activă; o trecere este „curată” numai dacă
distanța minimă măsurată depășește marja; un contact există numai ca fapt al proprietarului
coliziunilor.

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Scenarii deterministe | **7/7** PASS |
| Obstacole acceptate / refuzate | **96 / 9** |
| Stimuli observați | **11** |
| Reacții măsurate (frână / virare) | **10** (7 / 3) |
| Oportunități de claxon / claxoane / refuzuri | **5 / 1 / 1** |
| Rezultate: oprite / trecute curat / trecute aproape / contacte | **5 / 3 / 1 / 2** |
| Determinism | 2 rulări, **identice**, SHA-256 `cb7be00c54458ef6a338cba30ba411ec33fdeaea79cfcfae18b25ffce1a201cb` |
| Verdict | **PASS** |

## Cum este definit un stimul și cum este observabil debutul

Un stimul este debutul observabil al unui pericol pentru un vehicul. Modulul nu raportează
„apropiere”: raportează momentul în care pericolul intră în raza de observare (80 m implicit) **și** în
conul frontal (120° implicit), cu tick, poziție, tip, vehicul, mod de control, distanță, viteză de
apropiere și timp până la pericol. Un pericol aflat în spatele vehiculului sau dincolo de rază nu
produce stimul; la întoarcere, debutul este tick-ul observării, nu un moment inventat mai devreme.

Identitatea stimulului se derivă din sesiune, epoca lumii, pericol, vehicul și incarnare și **nu
conține tick-ul**. Aceeași apropiere observată mai târziu păstrează același ID, deci latența se poate
măsura față de un moment stabil; testul compară o apropiere de la 40 m (debut la tick 0) cu una de la
100 m (debut la tick 100) și obține exact același ID cu tick-uri diferite.

Exemplul măsurat în scenariul `sudden-obstacle` (obstacol programat să apară la tick 71):

| Fapt | Valoare |
| --- | ---: |
| Tick de apariție (seed 165) | 71 |
| Stimuli înainte de apariție | 0 |
| Debut observabil | tick 71 |
| Distanță la debut | 25,80 m |
| Timp până la pericol | 2,15 s |
| Frânare | tick 116 |
| Latență | **45 tick-uri = 0,75 s** |
| Rezultat | `STOPPED` la tick 205 |
| Distanță minimă | 5,90 m |

Reacția este un **front**: dacă vehiculul frâna deja la debut, nu primește o reacție fabricată; dacă
frânează sau virează după debut, primul front este înregistrat o singură dată, cu latență în tick-uri
și secunde. În `delayed-reaction`, aceeași apropiere cu frânare la 90 de tick-uri produce exact
latența 90 (1,500 s) și același ID de stimul ca scenariul anterior.

## Aceeași fizică pentru jucător și AUTO, fără imunitate

Modulul nu mișcă vehiculul și nu calculează o oprire paralelă. Expune faptele exacte ale unei cutii
denumite (`HazardObstacle.physics`), iar compoziția le înregistrează pe canalul comun al
coliziunilor. Dovada rulează Rapier real, cu același vehicul și aceeași cutie, sub etichete `MANUAL`
și `AUTO`:

| Mod | Acțiune | Collider | Debut | Latență | Contact | Impuls (N·s) | Distanță minimă (m) | Rezultat |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| MANUAL | BRAKE | OBSTACLE | 0 | 121 | — | 0,000 | 17,050 | `STOPPED` |
| AUTO | BRAKE | OBSTACLE | 0 | 121 | — | 0,000 | 17,050 | `STOPPED` |
| MANUAL | LATE | OBSTACLE | 0 | 211 | 242 | 14 033,656 | 1,998 | `CONTACT` |
| AUTO | LATE | OBSTACLE | 0 | 211 | 242 | 14 033,656 | 1,998 | `CONTACT` |
| MANUAL | EVADE | OBSTACLE | 0 | 31 | — | 0,000 | 17,911 | `PASSED_CLEAR` |
| AUTO | EVADE | OBSTACLE | 0 | 31 | — | 0,000 | 17,911 | `PASSED_CLEAR` |
| MANUAL | BRAKE | GENERIC_CONTACT | 0 | 121 | — | 0,000 | 17,050 | `STOPPED` |
| MANUAL | LATE | GENERIC_CONTACT | 0 | 211 | 242 | 14 033,656 | 1,998 | — |

Verificările perechii:

| Verificare | Rezultat |
| --- | --- |
| `manual-auto-brake-identical` | poziția finală −19,66814 pentru ambele, zero contacte |
| `manual-auto-contact-identical` | contact la tick 242 și impuls 14 033,656 N·s pentru ambele |
| `late-input-is-the-only-difference` | brațul târziu lovește, brațul devreme se oprește curat |
| `manual-auto-evade-identical` | 17,911 m clearance pentru ambele, zero contacte |
| `obstacle-is-an-ordinary-contact` | peretele generic cu aceleași dimensiuni produce exact aceleași numere |
| `collider-registered-once` | obstacolul este o cutie denumită în registrul comun de coliziuni |
| `brake-latency-measured` | latență de frânare 121 tick-uri |
| `evade-latency-measured` | latență de virare 31 tick-uri |

Diferența dintre oprire și contact vine **numai** din momentul comenzii: același vehicul, aceeași
cutie, același solver. Nu există ramură pe modul de control și nici imunitate pentru jucător. Brațele
`GENERIC_CONTACT` sunt martori de fizică: aceeași cutie, alt nume, altă înregistrare — numerele
coincid, deci obstacolul de pericol este un contact obișnuit. Modulul primește faptul de contact numai
pentru pericolul propriu; un perete generic nu este declarat contact de pericol.

## Claxonul: oportunitate dovedită, canal live lipsă

O oportunitate are condiții observabile — `IMMINENT_HAZARD` după timpul până la pericol (≤ 3 s),
`PEDESTRIAN_IN_PATH` pentru un pieton în traversare, `OBSTACLE_BLOCKS_PATH` pentru un obstacol care
blochează calea — și se deschide o singură dată per stimul. În `horn-opportunity` (pieton la 15 m,
8 m/s), oportunitatea se deschide la tick 0 cu `IMMINENT_HAZARD + PEDESTRIAN_IN_PATH`, claxonul din
fixture este măsurat la 18 tick-uri, o a doua apăsare este refuzată (`OPPORTUNITY_ALREADY_USED`), iar
un claxon apăsat când pericolul este la 110 m este refuzat (`NO_OPEN_OPPORTUNITY`).

`VehicleCommand` nu are câmp de claxon, iar PBI 163 a declarat deja acțiunea ca fixture controlat.
Contractul declară explicit `HAZARD_HORN_CHANNEL.liveInput = 'UNAVAILABLE'` și listează ce lipsește
pentru live: un keybinding în input, un câmp sau eveniment pe `VehicleCommand` și feedback audio/HUD.
Oportunitatea și măsurarea sunt dovedite prin fixture, nu prin input uman.

## Obstacole ca date, cu politici de margine

Pozițiile din fixture sunt derivate din banda reală `lane:00E0` (172,40 m), nu hardcodate în scenă.
Fiecare obstacol are ID, tip închis, poziție, dimensiune, politică de margine și, opțional, un moment
de apariție cu jitter derivat din seed. Refuzurile măsurate:

| Motiv | Număr | Exemplu |
| --- | ---: | --- |
| `DUPLICATE_ID` | 1 | al doilea `cone-1` |
| `OUTSIDE_MAP_BOUNDS` | 1 | cutie peste marginea hărții cu `REJECT_OUTSIDE` |
| `INVALID_GEOMETRY` | 1 | jumătate de dimensiune zero |
| `UNKNOWN_TYPE` | 1 | tip în afara vocabularului |
| `INVALID_SCHEDULE` | 1 | `activeFromTick` negativ |
| `UNKNOWN_EDGE_POLICY` | 1 | politică în afara vocabularului |
| `CAPACITY` | 3 | peste 96 de obstacole (capacitatea canalului de coliziune) |

`CLIP_TO_BOUNDS` a decupat o cutie cu depășire de 4,00 m la jumătate de lățime 3 m și a raportat
depășirea; o decupare degenerată este refuzată. Apariția este deterministă: seed 165 → tick 71, seed
166 → tick 84, iar aceleași intrări produc aceleași momente.

## Scenarii executate

| Scenariu | Pași | Stimuli | Reacții | Oprite | Trecute curat | Trecute aproape | Contacte | Claxon | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| sudden-obstacle | 420 | 1 | 1 | 1 | 0 | 0 | 0 | 0/1 | PASS |
| delayed-reaction | 460 | 1 | 1 | 1 | 0 | 0 | 0 | 0/1 | PASS |
| evasive-manoeuvre | 300 | 1 | 1 | 0 | 1 | 0 | 0 | 0/1 | PASS |
| physical-same-physics | 520 | 6 | 6 | 2 | 2 | 0 | 2 | 0/0 | PASS |
| horn-opportunity | 140 | 1 | 0 | 0 | 0 | 1 | 0 | 1/1 | PASS |
| obstacle-data | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | PASS |
| determinism | 260 | 1 | 1 | 1 | 0 | 0 | 0 | 0/1 | PASS |

`horn-opportunity` se încheie `PASSED_CLOSE` (0,07 m) pentru că fixture-ul nu are fizică: modulul nu
inventează un contact și nu declară „trecere curată” când distanța minimă este sub marjă.

## Determinism

Două rulări independente cu aceleași intrări și seed 165 produc aceeași amprentă SHA-256:
`cb7be00c54458ef6a338cba30ba411ec33fdeaea79cfcfae18b25ffce1a201cb`. Seed 166 produce altă amprentă
și alt moment de apariție, pentru că jitter-ul este derivat explicit din seed, nu dintr-un ceas.

## Cost structural

Măsurat pe 600 de pași cu un vehicul și un obstacol:

| Indicator | Valoare |
| --- | ---: |
| Pași măsurați | 600 |
| Evaluări de pericol | 600 |
| Evaluări de vehicule | 600 |
| Vârf pericole active pe pas | 1 |
| Vârf vehicule pe pas | 1 |
| Timp local de generare a raportului | ≈ 1,1 s (crește la ≈ 5,9 s sub sarcină concurentă) |

Costul per pas este O(vehicule × pericole active), cu plafoane explicite: 96 de obstacole (capacitatea
canalului de coliziune), 110 vehicule, 256 de pietoni, 4096 stimuli, 1024 oportunități, claxoane și
contacte. `step` nu construiește snapshot-uri; pozițiile și inspecția se cer explicit. Timpul local de
generare este o observație de dezvoltare, nu o dovadă de FPS sau hardware: PBI 165 nu are
`performance_checks`.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 erori, 0 warning-uri |
| `npm run format:check` | PASS, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 368 fișiere TypeScript, probe negative 6+4+3 |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | 2942 teste, 2942 trecute, 0 eșuate, 0 sărite, 102 358 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/world/hazards.test.ts"` | 18 teste, 18 trecute, 0 eșuate |
| `npm run hazards:report` | 7/7 scenarii PASS, 11 stimuli, 10 reacții, 2 contacte, 1 claxon, determinism identic, overall PASS |
| `npm run hazards:report -- --check` | „Hazard report is current” + „Hazard markdown is current” |

## Fișiere atinse

- [`src/world/hazards.ts`](../../../src/world/hazards.ts) — contractul `165-hazards-v1`: obstacole ca
  date și politici de margine, apariție derivată din seed, stimuli cu identitate stabilă, reacții ca
  front, rezultate închise, oportunități și refuzuri de claxon, inspecție fără numitori ficși.
- [`src/world/index.ts`](../../../src/world/index.ts) — exportul public al modulului.
- [`tests/world/hazards-fixture.ts`](../../../tests/world/hazards-fixture.ts) — harta reală, banda
  dreaptă de 172,4 m, obstacole derivate din poziții de bandă, pieton de fixture.
- [`tests/world/hazards-suite.ts`](../../../tests/world/hazards-suite.ts) — cele 7 scenarii, armurile
  Rapier `MANUAL`/`AUTO`, refuzurile, determinismul și raportul.
- [`tests/world/hazards.test.ts`](../../../tests/world/hazards.test.ts) — 18 teste de contract.
- [`scripts/run-hazard-report.mjs`](../../../scripts/run-hazard-report.mjs) — raportul determinist cu
  `--check`.
- [`package.json`](../../../package.json) — intrarea `hazards:report`, ultima din blocul `scripts`.
- [`Docs/20-extensii-si-mers-pe-jos.md`](../../20-extensii-si-mers-pe-jos.md) — secțiunea „Pericole,
  obstacole și claxon (PBI 165)”.
- `Docs/Evidence/165-hazards/{README.md,report.json,report.md}` — aceste dovezi.

## Limitări

- Nivel determinist în Node: fără browser, GPU sau input uman. Scenariile deterministe scriptează
  mișcarea vehiculului; numai `physical-same-physics` rulează fizica Rapier reală.
- Claxonul nu are canal live: `VehicleCommand` nu expune horn, deci oportunitatea și apăsarea sunt
  dovedite prin fixture controlat; pentru live lipsesc keybinding-ul, câmpul/evenimentul de comandă și
  feedback-ul audio/HUD.
- Pietonii din scenariul de claxon sunt un fapt de fixture (poziție și stare); populația reală rămâne
  a contractului 164. Modulul nu detectează fizic impactul și nu inventează contacte.
- Politica de margine este plană (X/Z), derivată din bounds-ul hărții; nu modelează înălțimea
  clădirilor sau trotuarele.
- Pragurile numerice (rază, con, frână, virare, timp până la pericol pentru claxon) sunt candidate de
  design raportate explicit, nu valori de calibrare în catalogul de parametri.
- Timpul local de generare nu este o măsurătoare de performanță hardware.
