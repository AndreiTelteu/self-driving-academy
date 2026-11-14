# 188 — Provocări pentru comportamentele extinse

Implementare V2 pentru cele cinci familii cerute: pietoni, rutare, semnalizare, pericole și serviciu. Catalogul 231 rămâne neschimbat; provocările extinse trăiesc într-un modul separat și sunt publicate alături de el printr-un catalog compus.

## Implementare

- `src/missions/extended-challenges.ts` — schema `188-extended-challenges-v1`, catalogul `188-extended-challenge-catalog-v1` cu 15 provocări (3 per familie) și 15 evaluatori puri.
- Fiecare provocare declară exact o cheie reală din cele 56 V2 ale tabelului 187, o valoare `keyValue` în intervalul real al catalogului și un prag derivat din cheie. Derivările sunt închise (`MIN_METRES`, `MAX_METRES`, `MAX_SPEED_MPS`, `MAX_ACCEL_MPS2`, `MIN_TICKS`, `MAX_TICKS`, `MIN_RATIO`, `MIN_YIELDS_PER_OPPORTUNITY`, `MAX_COUNT_PER_OPPORTUNITY`), iar unitatea cheii trebuie să coincidă cu unitatea faptului măsurat — un prag în metri nu poate fi derivat dintr-o cheie în secunde.
- Faptele sunt înregistrate la 60 Hz în șase fluxuri reale: traversări de pietoni, decizii de rută, recuperări, oportunități de semnalizare, treceri de pericole și opriri de serviciu. „Cedează” este ordinea a două tick-uri, nu un boolean al apelantului; un câmp `score` sau `yielded` este refuzat.
- `createComposedChallengeCatalog()` publică 12 template-uri 231 + 15 provocări extinse = 27, cu spații de ID disjuncte.
- Prerechizitele sunt fail-closed: `SESSION:*`, `CONTROL:MANUAL`, `VEHICLE_CLASS:*`, `CAPABILITY:*`, `LEARNING_KEY:*`, `CAMPAIGN:n` sunt numite explicit, iar `planExtendedChallengeAttempt` refuză o provocare exclusă.
- `importV1ProgressContext(progress, unlocks)` citește progresul 125 fără nicio scriere și întoarce digeste stabile.

## Tabel provocare → familie → chei → obiectiv observabil → explicație

| Provocare | Familie | Cheie (prag derivat) | Obiectiv observabil | Explicație (de ce / ce simte) |
| --- | --- | --- | --- | --- |
| `v2-challenge-pedestrian-yield` | Pietoni | `pedestrian_yield_probability` → 4 din 4 oportunități | Fiecare traversare are `egoEnteredTick >= pedestrianClearedTick`; se numără traversările reale | Cheia este probabilitatea de cedare per oportunitate; pietonul simte mașina oprindu-se înainte să pășească |
| `v2-challenge-pedestrian-clearance` | Pietoni | `pedestrian_clearance` → minim 2 m | Distanța minimă reală la fiecare traversare, măsurată de geometria 164 | Podeaua fizică peste marja vehiculului; pietonul nu face un pas înapoi pe trotuar |
| `v2-challenge-crosswalk-approach` | Pietoni | `crosswalk_approach_speed` → maxim 5 m/s | Viteza de apropiere măsurată la fiecare traversare | Plafon legat de distanța de oprire; pietonul poate estima că mașina chiar oprește |
| `v2-challenge-reroute-patience` | Rutare | `reroute_patience` → minim 1200 tick-uri (20 s) | `rerouteCommittedTick - betterAlternativeSeenTick` la fiecare rerutare | Așteptarea înainte de comiterea unei rute mai bune; pasagerul simte o singură schimbare, nu cotigeli |
| `v2-challenge-u-turn-discipline` | Rutare | `u_turn_willingness` → 0 întoarceri permise din 3 | Numărul de porniri de întoarcere pe `FORBIDDEN`/`UNKNOWN` și cele permise consumate | Eșantionare per oportunitate, inertă la interdicție; ceilalți șoferi pot anticipa manevra |
| `v2-challenge-reverse-recovery` | Rutare | `reverse_recovery_duration` → minim 150 tick-uri (podea 2,5 s) | Durata reală `reverseEndedTick - reverseStartedTick`, doar cu spatele declarat liber | Podeaua 181 (3 m la 1,2 m/s); pasagerul simte o recuperare controlată, nu o smucitură |
| `v2-challenge-red-gap` | Semnalizare | `red_run_gap_acceptance` → minim 150 tick-uri (2,5 s) | Gap-ul real de trafic transversal la o traversare pe roșu; zero traversări trece automat | Gap-ul minim acceptat, plafonat la 3 s; traficul transversal are timp să te vadă |
| `v2-challenge-yellow-decision` | Semnalizare | `yellow_stop_probability` → 2 din 2 galbene fezabile | Oprire (`stopTick`) fără traversare la galbenul cu oprire fezabilă | Galben fezabil oprit, nu transformat în frânare de urgență; pasagerul nu zboară în centură |
| `v2-challenge-green-launch` | Semnalizare | `green_launch_acceleration` → maxim 1,5 m/s² | Accelerația de lansare măsurată după eliberarea reală a verdelui | Accelerația de lansare, nu întârzierea; pietonul care termină traversarea nu este speriat |
| `v2-challenge-obstacle-clearance` | Pericole | `obstacle_clearance` → minim 1 m | Distanța minimă reală la fiecare trecere de obstacol și impulsul de coliziune | Podeaua fizică peste lățimea vehiculului; pasagerul nu este aruncat de o oglindă atinsă |
| `v2-challenge-hazard-reaction` | Pericole | `hazard_reaction_delay` → maxim 30 tick-uri (0,5 s) | `brakeTick - stimulusTick` la fiecare stimul real de pericol | Întârzierea dintre stimul și frânare; pasagerul simte răspunsul imediat |
| `v2-challenge-emergency-brake` | Pericole | `emergency_brake_intensity` → minim 1,0 din capacitate | Fracția `appliedDecelMps2 / availableDecelMps2` și oprirea înainte de `requiredStopTick` | Intensitatea din capacitatea reală, plafonată de aderență; centura ține oprirea, nu speranța |
| `v2-challenge-pickup-precision` | Serviciu | `pickup_stop_precision` → maxim 1 m | Offset-ul real al opririi față de punctul de îmbarcare | Fereastra de precizie din zona de serviciu; pasagerul urcă de pe trotuar |
| `v2-challenge-pickup-dwell` | Serviciu | `pickup_dwell_time` → minim 180 tick-uri (3 s) | `departedTick - arrivedTick`, cu `departedTick >= boardedTick` și dovada 061 | Durata până la dovada îmbarcării; pasagerul are timp să pună centura |
| `v2-challenge-dropoff-curb` | Serviciu | `dropoff_curb_distance` → maxim 0,5 m | Distanța reală la bordură la fiecare oprire de debarcare | Banda cu podea față de bordură; pasagerul coboară direct pe trotuar |

## Dovada păstrării progresului V1 și a accesului la vehicule

Testul `188 V1 progress import and vehicle access are byte-identical before and after` (`tests/missions/extended-challenges.test.ts`) face un instantaneu **înainte** de orice cod 188, rulează tot catalogul extins (catalog, eligibilitate, planuri, verdicte, import), apoi reface instantaneul **după** și compară JSON byte cu byte. Instantaneele sunt calculate de contractele livrate: campania 116 completă prin trackerul real, ledgerul 125, `PlayerProgress` 213 și flota reală 057 (24 taxiuri, 40 civili).

| Dovadă | Valoare măsurată |
| --- | --- |
| Catalog 231 | 12 template-uri, versiune `231-challenge-templates-v1`, digest `fnv1a32:9714302b` |
| Progres campanie 125 | 8 misiuni finalizate, digest `fnv1a32:7f45fc70` |
| Deblocări 125 | listă monotonă, digest `fnv1a32:0da1f677` |
| Acces vehicule 125 | 64/64 conduse, 24/24 taxiuri selectabile, revocate 0, taxiuri blocate 0, digest `fnv1a32:bdd636b4` |
| `PlayerProgress` 213 | digest `fnv1a32:8646bf48` |
| Import checkpoint 213 | `parsePlayerProgress` round-trip, digest `fnv1a32:92f67b0f` |
| Import progres V1 înainte/după | același digest; `profileWrites: 0`, `learningJobs: 0` |
| Catalog compus | 12 + 15 = 27, zero ID-uri comune |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (tsc pentru `src` și `tests`) |
| `npm run lint` | PASS (0 warnings) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (391 fișiere TypeScript; probele negative 6/4/3 trec) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | 3250 teste, 3250 trecute, 0 eșecuri, 1 suită, 109,8 s |
| `node --import ./scripts/register-typescript.mjs --test tests/missions/extended-challenges.test.ts tests/missions/extended-challenges-report.test.ts` | 16 teste, 16 trecute |
| `npm run missions:challenges-v2` | 40/40 verificări, 15 provocări, 5 familii, 15/56 chei acoperite, 12 template-uri 231, catalog compus 27, digest `fnv1a32:a043542d`, overall PASS |
| `npm run missions:challenges-v2 -- --check` | raportul JSON și Markdown sunt curente |

## Fișiere atinse

- `src/missions/extended-challenges.ts` (nou)
- `src/missions/index.ts` (export la final)
- `tests/missions/extended-challenges.test.ts` (nou)
- `tests/missions/extended-challenges-fixture.ts` (nou)
- `tests/missions/extended-challenges-report.ts` (nou)
- `tests/missions/extended-challenges-report.test.ts` (nou)
- `scripts/run-v2-challenges-report.mjs` (nou)
- `package.json` (o singură intrare nouă, ultima: `missions:challenges-v2`)
- `Docs/13-misiuni-si-progres.md` (secțiune nouă la final)
- `Docs/Evidence/188-v2-challenges/README.md`, `report.json`, `report.md`
- `PBI/In Progress/188-missions_v2.md` → `PBI/Done/188-missions_v2.md`

## Limitări

- Catalogul livrat acoperă 15 dintre cele 56 de chei V2; cele 41 rămase sunt raportate explicit în `report.json` (`learningKeys.uncovered`) și nu au încă o provocare dedicată.
- Pragurile sunt derivate din valorile reale ale catalogului și din podelele politicilor livrate (de exemplu 2,5 s pentru recuperare), dar calibrarea lor de joc rămâne o propunere până la playtest.
- Modulul nu conține programarea ofertelor, ciclul de viață al instanței, XP-ul sau istoricul de reluare; acestea rămân la 233.
- Verificarea de condus este deterministă, pe fapte de tick; nu înlocuiește un playtest uman.
