# Note de compatibilitate V2 față de 0.3 (PBI 190)

> Fișier generat determinist de `npm run release:v2`. Nu edita manual.

Fiecare afirmație are cel puțin o referință la o dovadă comisă; un detaliu derivat din fișier este afișat lângă referință. **15/15 afirmații susținute de dovezi existente** (5 schimbări, 3 identice, 3 noutăți, 4 deschise).

## Ce s-a schimbat față de 0.3

| Afirmație | Public | Dovadă | Detaliu derivat | Stare |
| --- | --- | --- | --- | --- |
| Față de 0.3, jucătorul primește 15 provocări extinse noi în 5 familii, publicate alături de cele 12 template-uri V1 într-un catalog compus de 27. | jucător | `Docs/Evidence/188-v2-challenges/report.json`<br>`Docs/Evidence/188-v2-challenges/README.md` | 40/40 verificări, 15 provocări, catalog compus 27<br>tabelul provocare → familie → cheie → obiectiv observabil | SUSȚINUTĂ |
| Lumea are acum pietoni și pericole reale: 96 pietoni pe 80 treceri (6 scenarii) și 11 stimuli de pericol cu 7 scenarii. | jucător | `Docs/Evidence/164-pedestrians/report.json`<br>`Docs/Evidence/165-hazards/report.json` | 6/6 scenarii trecute, 96 pietoni<br>7/7 scenarii trecute, 10 reacții | SUSȚINUTĂ |
| Integratorul primește 56 straturi de politică V2, fiecare cu estimator, dovezi comise și test independent; poarta 187 certifică 80/80 chei. | integrator | `Docs/Evidence/187-v2-parameter-gate/report.json`<br>`src/profiles/parameter-capabilities.ts` | verdict PASS, 24 CORE + 56 V2, 0 findings<br>tabelul unic de capabilități, cu politică, estimator, dovezi și test per cheie | SUSȚINUTĂ |
| Poarta este executabilă, nu declarativă: `npm run validate:parameters` derivă verdictul din catalog și din fișiere, iar `--check` refuză un raport neactualizat; 2 probe fail-closed sunt respinse la fiecare rulare. | integrator | `Docs/Evidence/187-v2-parameter-gate/report.json`<br>`scripts/run-v2-parameter-gate.mjs` | 12/12 verificări PASS, 2 probe respinse<br>comanda porții și modul `--check` | SUSȚINUTĂ |
| Suita completă crește de la V1 la V2: 3250 teste, 3250 trecute, 0 eșuate pe revizia 189, față de 2 898 teste, 2 898 trecute, 0 eșuate, 0 sărite la checklist-ul V1 162. | integrator | `Docs/Evidence/189-v2-regression/report.json`<br>`Docs/Evidence/162-release-v1/checklist.json` | 3250 teste, 3250 trecute, 0 eșuate<br>2 898 teste, 2 898 trecute, 0 eșuate, 0 sărite | SUSȚINUTĂ |

## Ce rămâne identic

| Afirmație | Public | Dovadă | Detaliu derivat | Stare |
| --- | --- | --- | --- | --- |
| Progresul V1 rămâne identic: 27 rânduri PASS din 29 (2 NOT_RUN declarate), 0 eșecuri, pierderi XP 0; importul de progres al lui 188 dă același digest înainte/după (fnv1a32:7f45fc70), cu 0 scrieri de profil. | jucător | `Docs/Evidence/216-v1-regression/report.json`<br>`Docs/Evidence/189-v2-regression/report.json`<br>`Docs/Evidence/188-v2-challenges/report.json` | 27/29 PASS<br>29 rânduri, 27 PASS, 0 FAIL, 2 NOT_RUN; pierderi XP 0, debitări 0<br>beforeAfterEqual true, profileWrites 0 | SUSȚINUTĂ |
| Accesul la vehicule rămâne identic: 64/64 vehicule conduse, 24/24 taxiuri selectabile, 0 revocări și 0 taxiuri blocate, cu digestul fnv1a32:bdd636b4. | jucător | `Docs/Evidence/188-v2-challenges/report.json`<br>`Docs/Evidence/188-v2-challenges/README.md` | v1AccessDigest fnv1a32:bdd636b4<br>instantaneul accesului la vehicule înainte/după | SUSȚINUTĂ |
| Acordurile de salvare rămân identice: exportul și importul trec 53/53, respectiv 53/53 verificări, păstrează 56 chei rezervate cu valoarea `null`, iar restartul sesiunii re-citește aceleași documente în 104 verificări. | ambii | `Docs/Evidence/133-export-profile/report.json`<br>`Docs/Evidence/134-import-profile/report.json`<br>`Docs/Evidence/152-e2e-session/report.json` | 53/53 verificări<br>53/53 verificări, 56 chei rezervate<br>11 pași, 104 verificări | SUSȚINUTĂ |

## Ce este nou

| Afirmație | Public | Dovadă | Detaliu derivat | Stare |
| --- | --- | --- | --- | --- |
| Nou față de 0.3: 56 chei de extensie certificate (V2) lângă cele 24 chei CORE, cu 80 politici și 80 estimatori declarați, 0 fără estimator. | ambii | `src/profiles/parameter-capabilities.ts`<br>`Docs/Evidence/187-v2-parameter-gate/report.json` | tabelul cu 24 de intrări CORE și 56 V2<br>56 efecte măsurate + 24 consecințe M păstrate | SUSȚINUTĂ |
| Nou față de 0.3: poarta celor 80 de parametri, care cere pentru fiecare cheie consumator real în politică, estimator, dovezi și test cu titlul declarat; o cheie declarată fără consumator este respinsă. | integrator | `Docs/Evidence/187-v2-parameter-gate/report.json`<br>`Docs/Evidence/187-v2-parameter-gate/README.md` | 8 convenții canonice, 0 findings<br>probele negative și convențiile ambiguităților | SUSȚINUTĂ |
| Nou față de 0.3: workload-ul V2 versionat `189-workload-v2-1` compune 30 taxiuri și 40 civili, 96 pietoni, 96 obstacole, catalogul de 80 chei și 15 provocări. | integrator | `Docs/Evidence/189-v2-regression/report.json` | timing NOT_RUN; 4 dovezi funcționale reexecutate | SUSȚINUTĂ |

## Ce rămâne deschis

| Afirmație | Public | Dovadă | Detaliu derivat | Stare |
| --- | --- | --- | --- | --- |
| Cele 56 chei extinse sunt certificate, dar încă rezervate de etapa de plan: `candidate-validation` le refuză cu `KEY_EXTENSION_STAGE`, iar exportul le scrie în `reservedParameters`; certificarea 187 nu le face livrabile end-to-end. | ambii | `src/learning/candidate-validation.ts`<br>`src/persistence/profile-export.ts`<br>`Docs/Evidence/187-v2-parameter-gate/README.md` | refuzul cheilor de extensie la validarea candidaților<br>cheile rezervate publicate cu valoarea null<br>limitarea declarată de poartă | SUSȚINUTĂ |
| Provocările 188 acoperă 15 din 56 chei V2; 41 rămân fără o provocare dedicată, deci nu au încă o demonstrație de joc. | jucător | `Docs/Evidence/188-v2-challenges/report.json`<br>`Docs/Evidence/188-v2-challenges/README.md` | 15 chei acoperite, 41 neacoperite<br>lista cheilor neacoperite | SUSȚINUTĂ |
| Performanța V2 rămâne `NOT_RUN`: FPS-ul pe hardware este `NOT_VALIDATED`, harness-ul de performanță nu are fixture cu pietoni și pericole (NOT_RUN), iar soak-ul V2 nu are variantă cu acel workload. | ambii | `Docs/Evidence/189-v2-regression/report.json`<br>`Docs/Evidence/224-performance-gate/report.json`<br>`Docs/Evidence/189-v2-regression/README.md` | 3 rânduri NOT_RUN declarate<br>16 PASS, 0 FAIL, 1 NOT_VALIDATED; release NOT_VALIDATED<br>harness-ul existent nu poate exprima workload-ul V2 | SUSȚINUTĂ |
| Documentația de registry are o contradicție cunoscută: `Docs/parameter-registry.md` descrie încă regula V1 (`estimable=false` pentru toate cheile, LEARNED respins pentru toate), deși tabelul 187 declară 80 de estimatori. Aparține proprietarului documentului și este raportată, nu ascunsă. | integrator | `Docs/parameter-registry.md`<br>`Docs/Evidence/187-v2-parameter-gate/README.md` | regula V1 rămasă în document<br>limitarea declarată de 187 | SUSȚINUTĂ |

## Verdictul notelor

Toate afirmațiile au o dovadă existentă; notele nu conțin un „PASS" generic.
