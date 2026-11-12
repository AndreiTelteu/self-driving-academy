# 165 — pericole, obstacole și claxon

Transcript determinist generat de `scripts/run-hazard-report.mjs`; comanda comisă este `npm run hazards:report`.
Machine-readable: [report.json](report.json). Contract: `165-hazards-v1`.

Regula oracolului: Un stimul există numai când pericolul este observabil (în rază și în conul frontal); o reacție este numai un front după debut; o trecere este „curată” numai dacă distanța minimă măsurată depășește marja, iar un contact există numai ca fapt al proprietarului coliziunilor.

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Scenarii deterministe | **7/7** PASS |
| Obstacole acceptate / refuzate | 96 / 9 |
| Stimuli observați | **11** |
| Reacții măsurate (frână / virare) | **10** (7 / 3) |
| Oportunități de claxon / claxoane / refuzuri | **5 / 1 / 1** |
| Rezultate: oprite / trecute curat / trecute aproape / contacte | 5 / 3 / 1 / 2 |
| Determinism | 2 rulări, identice: DA, SHA-256 `cb7be00c54458ef6a338cba30ba411ec33fdeaea79cfcfae18b25ffce1a201cb` |
| Momente de apariție (seed 165 / 165 / 166) | 71 / 71 / 84 |
| Verdict | **PASS** |

## Fixture

| Indicator | Valoare |
| --- | ---: |
| Hartă | neighbourhood-compact-v1 |
| Bandă reală folosită | lane:00E0 |
| Lungime bandă | 172.40 m |
| Poziția obstacolului pe bandă | 100 m |
| Seed explicit | 165 |
| Tick de apariție pentru obstacolul programat | 71 |

Refuzuri pe motiv:

| Motiv | Număr |
| --- | ---: |
| DUPLICATE_ID | 1 |
| OUTSIDE_MAP_BOUNDS | 1 |
| INVALID_GEOMETRY | 1 |
| UNKNOWN_TYPE | 1 |
| INVALID_SCHEDULE | 1 |
| UNKNOWN_EDGE_POLICY | 1 |
| CAPACITY | 3 |

## Scenarii

| Scenariu | Pași | Stimuli | Reacții | Frână | Virare | Oprite | Trecute curat | Trecute aproape | Contacte | Oportunități claxon | Claxoane | Refuzuri | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| sudden-obstacle | 420 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | PASS |
| delayed-reaction | 460 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | PASS |
| evasive-manoeuvre | 300 | 1 | 1 | 0 | 1 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | PASS |
| physical-same-physics | 520 | 6 | 6 | 4 | 2 | 2 | 2 | 0 | 2 | 0 | 0 | 0 | PASS |
| horn-opportunity | 140 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 1 | PASS |
| obstacle-data | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| determinism | 260 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | PASS |

### Verificări per scenariu

| Scenariu | Verificare | Trecut | Detaliu |
| --- | --- | --- | --- |
| sudden-obstacle | single-stimulus | DA | stimuli 1 |
| sudden-obstacle | observable-onset | DA | onset tick 71, distance 25.80 m |
| sudden-obstacle | reaction-latency | DA | BRAKE after 45 ticks |
| sudden-obstacle | no-fictitious-denominator | DA | reaction rate 1 |
| sudden-obstacle | appearance-window | DA | appearTick 71 in [60, 90] |
| sudden-obstacle | no-stimulus-before-appearance | DA | zero stimuli before appearTick |
| sudden-obstacle | latency-exact | DA | latency 45 ticks |
| sudden-obstacle | stopped | DA | outcome STOPPED at 205 |
| sudden-obstacle | clearance | DA | minimum distance 5.90 m |
| sudden-obstacle | stimulus-distance | DA | distance 25.80 m at tick 71, TTC 2.15 s |
| sudden-obstacle | reaction-rate | DA | reaction rate 1 |
| delayed-reaction | single-stimulus | DA | stimuli 1 |
| delayed-reaction | observable-onset | DA | onset tick 0, distance 40.00 m |
| delayed-reaction | reaction-latency | DA | BRAKE after 90 ticks |
| delayed-reaction | no-fictitious-denominator | DA | reaction rate 1 |
| delayed-reaction | latency-exact | DA | latency 90 ticks |
| delayed-reaction | stable-identity | DA | the same stimulus id as the sudden-obstacle scenario |
| delayed-reaction | stopped | DA | outcome STOPPED at 179 |
| delayed-reaction | latency-in-seconds | DA | latency 1.500 s |
| evasive-manoeuvre | single-stimulus | DA | stimuli 1 |
| evasive-manoeuvre | observable-onset | DA | onset tick 0, distance 30.00 m |
| evasive-manoeuvre | reaction-latency | DA | STEER after 30 ticks |
| evasive-manoeuvre | no-fictitious-denominator | DA | reaction rate 1 |
| evasive-manoeuvre | steer-reaction | DA | STEER after 30 ticks |
| evasive-manoeuvre | passed-clear | DA | outcome PASSED_CLEAR, minimum 5.29 m |
| evasive-manoeuvre | lateral-clearance | DA | minimum distance 5.29 m |
| evasive-manoeuvre | no-contact | DA | contacts 0 |
| physical-same-physics | manual-auto-brake-identical | DA | stop z -19.66814 vs -19.66814, contact null vs null |
| physical-same-physics | manual-auto-contact-identical | DA | contact tick 242 vs 242, impulse 14033.656 vs 14033.656 N·s |
| physical-same-physics | late-input-is-the-only-difference | DA | the late brake arm contacts the obstacle while the early brake arm stops clear |
| physical-same-physics | manual-auto-evade-identical | DA | clearance 17.911 vs 17.911 m, zero contacts |
| physical-same-physics | obstacle-is-an-ordinary-contact | DA | stop z -19.66814 vs generic -19.66814; contact 242 vs 242 |
| physical-same-physics | collider-registered-once | DA | the hazard obstacle is a named box in the shared collision registry |
| physical-same-physics | brake-latency-measured | DA | brake latency 121 ticks |
| physical-same-physics | evade-latency-measured | DA | steer latency 31 ticks |
| horn-opportunity | opportunity-opened-at-onset | DA | opened tick 0 vs onset 0 |
| horn-opportunity | observable-conditions | DA | conditions IMMINENT_HAZARD + PEDESTRIAN_IN_PATH |
| horn-opportunity | horn-measured | DA | horn after 18 ticks |
| horn-opportunity | second-press-refused | DA | OPPORTUNITY_ALREADY_USED |
| horn-opportunity | press-without-opportunity-refused | DA | NO_OPEN_OPPORTUNITY |
| horn-opportunity | no-live-channel | DA | live input UNAVAILABLE; requires 3 additions |
| horn-opportunity | opportunity-closed | DA | closed tick 113 |
| obstacle-data | accepted-count | DA | accepted 96 |
| obstacle-data | duplicate-refused | DA | duplicate 1 |
| obstacle-data | outside-refused | DA | outside 1 |
| obstacle-data | geometry-refused | DA | invalid geometry 1 |
| obstacle-data | type-refused | DA | unknown type 1 |
| obstacle-data | schedule-refused | DA | invalid schedule 1 |
| obstacle-data | policy-refused | DA | unknown policy 1 |
| obstacle-data | capacity-refused | DA | capacity 3 |
| obstacle-data | clip-applied | DA | overshoot 4.00 m, half x 3 |
| obstacle-data | physics-identity | DA | entity id cone-1 |
| obstacle-data | lane-derived-position | DA | x 103.800 vs lane 103.800 |
| obstacle-data | no-scene-constants | DA | positions come from the lane fixture, not from hardcoded scene coordinates |
| determinism | same-seed-digest | DA | digest cb7be00c54458ef6… |
| determinism | same-seed-appearance | DA | appear ticks 71 / 71 |
| determinism | seed-drives-appearance | DA | seed 165 → 71, seed 166 → 84 |
| determinism | different-seed-digest | DA | digests differ: true |

## Stimuli și rezultate

Distanța este planară, măsurată până la centrul pericolului la debut; latența este numărul de tick-uri
dintre debutul observabil și primul front de comandă (frână sau virare), nu o stare deja activă.

| Scenariu | Pericol | Tip | Mod | Debut (tick) | Rezultat | Rezolvat (tick) | Distanță minimă (m) | Latență (tick-uri) | Contact (tick) |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| sudden-obstacle | obstacle-1 | OBSTACLE | AUTO | 71 | STOPPED | 205 | 5.90 | 45 | — |
| delayed-reaction | obstacle-1 | OBSTACLE | AUTO | 0 | STOPPED | 179 | 11.10 | 90 | — |
| evasive-manoeuvre | obstacle-1 | OBSTACLE | AUTO | 0 | PASSED_CLEAR | 129 | 5.29 | 30 | — |
| horn-opportunity | pedestrian-fixture-1 | PEDESTRIAN | MANUAL | 0 | PASSED_CLOSE | 113 | 0.07 | — | — |
| determinism | obstacle-1 | OBSTACLE | AUTO | 71 | STOPPED | 205 | 5.90 | 45 | — |

## Fizica reală: jucător contra AUTO

Armurile rulează în același tip de lume Rapier, cu același vehicul și aceeași cutie; diferă doar eticheta
modului și comenzile. `GENERIC_CONTACT` este un perete generic cu aceleași dimensiuni, înregistrat pe
același canal de coliziune: dacă numerele coincid, obstacolul de pericol este un contact obișnuit, fără
imunitate pentru jucător.

| Mod | Acțiune | Collider | Debut | Latență | Contact | Impuls (N·s) | Distanță minimă (m) | Rezultat |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| MANUAL | BRAKE | OBSTACLE | 0 | 121 | — | 0.000 | 17.050 | STOPPED |
| AUTO | BRAKE | OBSTACLE | 0 | 121 | — | 0.000 | 17.050 | STOPPED |
| MANUAL | LATE | OBSTACLE | 0 | 211 | 242 | 14033.656 | 1.998 | CONTACT |
| AUTO | LATE | OBSTACLE | 0 | 211 | 242 | 14033.656 | 1.998 | CONTACT |
| MANUAL | EVADE | OBSTACLE | 0 | 31 | — | 0.000 | 17.911 | PASSED_CLEAR |
| AUTO | EVADE | OBSTACLE | 0 | 31 | — | 0.000 | 17.911 | PASSED_CLEAR |
| MANUAL | BRAKE | GENERIC_CONTACT | 0 | 121 | — | 0.000 | 17.050 | STOPPED |
| MANUAL | LATE | GENERIC_CONTACT | 0 | 211 | 242 | 14033.656 | 1.998 | STOPPED |

| Verificare | Trecut | Detaliu |
| --- | --- | --- |
| manual-auto-brake-identical | DA | stop z -19.66814 vs -19.66814, contact null vs null |
| manual-auto-contact-identical | DA | contact tick 242 vs 242, impulse 14033.656 vs 14033.656 N·s |
| late-input-is-the-only-difference | DA | the late brake arm contacts the obstacle while the early brake arm stops clear |
| manual-auto-evade-identical | DA | clearance 17.911 vs 17.911 m, zero contacts |
| obstacle-is-an-ordinary-contact | DA | stop z -19.66814 vs generic -19.66814; contact 242 vs 242 |
| collider-registered-once | DA | the hazard obstacle is a named box in the shared collision registry |
| brake-latency-measured | DA | brake latency 121 ticks |
| evade-latency-measured | DA | steer latency 31 ticks |

## Claxonul ca oportunitate

Oportunitatea are condiții observabile — pericol iminent după timpul până la pericol, pieton în
traversare ori obstacol care blochează calea — și se deschide o singură dată per stimul. Claxonul este
măsurat numai prin fixture controlat: `VehicleCommand` nu are câmp de claxon, deci pentru live lipsesc
keybinding-ul, câmpul/evenimentul de comandă și feedback-ul audio/HUD. Un claxon fără oportunitate este
refuzat, iar o a doua apăsare pe aceeași oportunitate este refuzată.

## Cost structural

| Indicator | Valoare |
| --- | ---: |
| Scenariu de cost | cost-600-steps |
| Pași măsurați | 600 |
| Evaluări de pericol | 600 |
| Evaluări de vehicule | 600 |
| Vârf pericole active pe pas | 1 |
| Vârf vehicule pe pas | 1 |

Costul per pas este O(vehicule × pericole active), cu plafoane explicite pentru obstacole, vehicule,
pietoni, stimuli, reacții, oportunități și contacte. Modulul nu construiește snapshot-uri în `step`.

## Limitări

- Nivel determinist în Node: fără browser, GPU sau input uman. Mișcarea vehiculului este scriptată de fixture în scenariile deterministe; numai scenariul „physical-same-physics” rulează fizica Rapier reală.
- Claxonul nu are canal live: VehicleCommand nu expune horn, deci oportunitatea și apăsarea sunt dovedite prin fixture controlat; pentru live este nevoie de un keybinding, un câmp/eveniment pe VehicleCommand și feedback audio/HUD.
- Pietonii din scenariul de claxon sunt un fapt de fixture (poziție și stare); populația reală rămâne a contractului 164. Modulul nu detectează fizic impactul și nu inventează contacte.
- Politica de margine este plană (X/Z), derivată din bounds-ul hărții; nu modelează înălțimea clădirilor sau trotuarele.
- Pragurile numerice (rază, con, frână, virare, TTC de claxon) sunt candidate de design raportate explicit, nu valori de calibrare în catalogul de parametri.
- Timpul local de generare nu este o măsurătoare de performanță hardware: PBI 165 nu are performance_checks, iar costul raportat este structural.
