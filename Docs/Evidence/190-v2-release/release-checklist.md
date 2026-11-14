# Checklist de release V2 (PBI 190)

> Fișier generat determinist de `npm run release:v2`. Nu edita manual.

**Verdict: NOT_VALIDATED.** 11 `PASS`, 1 `FAIL`, 5 `NOT_RUN`; 6 rânduri deschise, fiecare cu owner. Un rând `NOT_RUN` nu este promovat la `PASS`, iar un rând fără dovadă comisă nu poate primi `PASS`.

## Rândurile checklist-ului

| Rând | Arie | Criteriu | Verdict | Owner | Dovadă | Detaliu |
| --- | --- | --- | --- | --- | --- | --- |
| `dependencies-v2` | Dependențe | Lanțul V2 163–189 este în Done, cu dovadă comisă și fără placeholder | PASS | — | `PBI/Done`<br>`Docs/Evidence` | 27/27 PBI-uri V2 în Done, cu README de dovezi fără „De completat" |
| `artifact-80` | Artefact | Artefactul celor 80 de chei este derivat și declară rezervarea celor 56 | PASS | — | `Docs/Evidence/190-v2-release/parameter-artifact.json` | 80 chei derivate: 80 politici, 80 estimatori, 56 rezervate, 15 cu provocare 188 |
| `catalog-fail-closed` | Catalog | Catalogul de date rămâne fail-closed; suportul runtime vine din tabelul 187 | PASS | — | `Docs/driving-parameters.json`<br>`src/profiles/parameter-capabilities.ts` | 80/80 intrări JSON cu implemented=false; 80/80 derivate implemented+estimable |
| `gate-187` | Gate | Poarta celor 80 de parametri: verdict derivat, fără findings | PASS | — | `Docs/Evidence/187-v2-parameter-gate/report.json` | 80/80 chei, 0 findings, verdict PASS |
| `challenges-188` | Gate | Provocările extinse: 15 provocări, 5 familii, verificări complete | PASS | — | `Docs/Evidence/188-v2-challenges/report.json` | 40/40 verificări, 15 provocări, 15/56 chei V2 acoperite |
| `regression-v1-189` | Regresii | Regresia V1 revizia 0.3 reexecutată pe revizia curentă | PASS | — | `Docs/Evidence/189-v2-regression/report.json`<br>`Docs/Evidence/216-v1-regression/report.json` | 29 rânduri, 27 PASS, 0 FAIL, 2 NOT_RUN; pierderi XP 0, debitări 0 |
| `compat-matrix-154` | Compatibilitate | Matricea WebGPU/WebGL 2 reexecutată, combinațiile lipsă declarate | PASS | — | `Docs/Evidence/154-compat-matrix/report.json`<br>`Docs/Evidence/189-v2-regression/report.json` | 9/9 combinații reale, 11/11 verificări deterministe, 11 declarate NOT_RUN |
| `save-roundtrip` | Salvare | Export/import păstrează valorile și cheile rezervate | PASS | — | `Docs/Evidence/133-export-profile/report.json`<br>`Docs/Evidence/134-import-profile/report.json` | export 53/53, import 53/53, 56 chei rezervate |
| `e2e-restart` | Salvare | Sesiunea integrală re-citește aceleași documente după restart | PASS | — | `Docs/Evidence/152-e2e-session/report.json` | 11 pași, 104 verificări, 0 eșuate |
| `docs-11-support` | Documentație | Docs/11 descrie suportul real după 187, fără afirmația V1 despre LEARNED | PASS | — | `Docs/11-catalog-parametri.md`<br>`Docs/Evidence/187-v2-parameter-gate/report.json` | secțiunea de suport real există și trimite la 187 |
| `docs-registry-v1-rule` | Documentație | Docs/parameter-registry.md descrie regula reală de estimare | PASS | — | `Docs/parameter-registry.md`<br>`Docs/Evidence/187-v2-parameter-gate/report.json` | documentul nu mai afirmă regula V1 |
| `inherited-v1-gates` | Moștenire V1 | Gate-urile V1 deschise (153, 235) rămân vizibile în release-ul V2 | FAIL | proprietarul 235 (experiență) și 153 (QA vizual) | `Docs/Evidence/162-release-v1/checklist.json` | checklist V1 162: 8 PASS, 2 FAIL, 1 NOT_VALIDATED, 2 NOT_RUN (26 itemi deschiși) |
| `fps-hardware` | Performanță | FPS, frame p95/p99 și lucru GPU pe hardware real, ambele backenduri | NOT_RUN | operatorul cu hardware real + proprietarul 224 | `Docs/Evidence/224-performance-gate/report.json`<br>`Docs/Evidence/189-v2-regression/report.json` | 224: NOT_VALIDATED; capturile hardware 220 sunt pe alt build, pragurile cer aceeași revizie. Nu se raportează FPS headless. |
| `harness-v2` | Performanță | Harness de performanță cu workload-ul V2 (pietoni, pericole, catalog complet) | NOT_RUN | proprietarul harness-ului 220/224 | `Docs/Evidence/189-v2-regression/report.json` | Harness-ul de performanță nu are fixture cu pietoni/pericole: 33 fișiere în tests/harness, 0 referințe de pietoni și 0 de pericole; dovezile 155/156/158/224 au 0 referințe. Măsurarea frame/simulare pe workload-ul V2 cere o pagină de harness și un GPU real, indisponibile aici. |
| `soak-v2` | Performanță | Soak V2 de 60 de minute pe workload-ul V2 | NOT_RUN | proprietarul 159/224 | `Docs/Evidence/189-v2-regression/report.json`<br>`Docs/Evidence/159-soak/report.json` | soak-ul comis (60,002 min, 20 cicluri) este pe workload-ul V1 și nu a fost reexecutat; nu există variantă cu pietoni/pericole |
| `playtest-human` | Experiență | Playtest uman: explicații, senzație de condus, provocări reluate | NOT_RUN | proprietarul 216/235 | `Docs/Evidence/216-v1-regression/report.json`<br>`Docs/Evidence/162-release-v1/checklist.json` | rândul C3 al regresiei V1 (NOT_RUN) și NOT_RUN în checklist-ul 162: zero participanți |
| `remeasure-224` | Performanță | Re-măsurarea dovezilor comise ale gate-ului 224 pe revizia curentă | NOT_RUN | proprietarul 224 | `Docs/Evidence/189-v2-regression/report.json`<br>`Docs/Evidence/224-performance-gate/report.json` | `npm run perf:gate -- --check` iese cu exit 1; 189 a reexecutat proaspăt doar structural (PASS), fără să suprascrie dovezile comise |

## Dependențele V2 (163–189)

| ID | Titlu | Fișier | Done | completed_at | Dovezi | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `163` | Scenarii și telemetrie pentru parametrii V2 | `PBI/Done/163-v2_contexts.md` | DA | `2026-11-12T16:44:41+02:00` | `Docs/Evidence/163-v2-contexts/README.md` | PASS |
| `164` | Pietoni autonomi și traversări | `PBI/Done/164-pedestrians.md` | DA | `2026-11-12T17:32:37+02:00` | `Docs/Evidence/164-pedestrians/README.md` | PASS |
| `165` | Pericole obstacole și claxon în scenarii | `PBI/Done/165-hazards.md` | DA | `2026-11-12T18:09:49+02:00` | `Docs/Evidence/165-hazards/README.md` | PASS |
| `166` | Activarea schemelor și suportului V2 | `PBI/Done/166-v2_migration.md` | DA | `2026-11-12T18:35:14+02:00` | `Docs/Evidence/166-profile-v2/README.md` | PASS |
| `167` | Politică extinsă pentru viteză și ritm | `PBI/Done/167-v2_policy_1.md` | DA | `2026-11-12T19:07:00+02:00` | `Docs/Evidence/167-v2-speed-policy/README.md` | PASS |
| `168` | Învățare extinsă pentru viteză și ritm | `PBI/Done/168-v2_learn_1.md` | DA | `2026-11-12T19:32:51.426+02:00` | `Docs/Evidence/168-v2-speed-learning/README.md` | PASS |
| `169` | Politică extinsă pentru accelerație și frânare | `PBI/Done/169-v2_policy_2.md` | DA | `2026-11-12T19:58:12+02:00` | `Docs/Evidence/169-v2-accel-policy/README.md` | PASS |
| `170` | Învățare extinsă pentru accelerație și frânare | `PBI/Done/170-v2_learn_2.md` | DA | `2026-11-12T20:25:41+02:00` | `Docs/Evidence/170-v2-accel-learning/README.md` | PASS |
| `171` | Politică extinsă pentru urmărire și distanțe | `PBI/Done/171-v2_policy_3.md` | DA | `2026-11-12T21:18:00+02:00` | `Docs/Evidence/171-v2-follow-policy/README.md` | PASS |
| `172` | Învățare extinsă pentru urmărire și distanțe | `PBI/Done/172-v2_learn_3.md` | DA | `2026-11-12T21:33:00+02:00` | `Docs/Evidence/172-v2-follow-learning/README.md` | PASS |
| `173` | Politică extinsă pentru semafoare | `PBI/Done/173-v2_policy_4.md` | DA | `2026-11-12T22:01:02+02:00` | `Docs/Evidence/173-v2-signal-policy/README.md` | PASS |
| `174` | Învățare extinsă pentru semafoare | `PBI/Done/174-v2_learn_4.md` | DA | `2026-11-13T00:05:00+02:00` | `Docs/Evidence/174-v2-signal-learning/README.md` | PASS |
| `175` | Politică extinsă pentru stop și prioritate | `PBI/Done/175-v2_policy_5.md` | DA | `2026-11-12T23:03:34+02:00` | `Docs/Evidence/175-v2-stop-policy/README.md` | PASS |
| `176` | Învățare extinsă pentru stop și prioritate | `PBI/Done/176-v2_learn_5.md` | DA | `2026-11-12T23:36:06+02:00` | `Docs/Evidence/176-v2-stop-learning/README.md` | PASS |
| `177` | Politică extinsă pentru schimbare de bandă și depășire | `PBI/Done/177-v2_policy_6.md` | DA | `2026-11-13T00:08:21+02:00` | `Docs/Evidence/177-v2-lane-policy/README.md` | PASS |
| `178` | Învățare extinsă pentru schimbare de bandă și depășire | `PBI/Done/178-v2_learn_6.md` | DA | `2026-11-13T00:44:34+02:00` | `Docs/Evidence/178-v2-lane-learning/README.md` | PASS |
| `179` | Politică extinsă pentru control lateral și viraje | `PBI/Done/179-v2_policy_7.md` | DA | `2026-11-13T01:20:29+02:00` | `Docs/Evidence/179-v2-lateral-policy/README.md` | PASS |
| `180` | Învățare extinsă pentru control lateral și viraje | `PBI/Done/180-v2_learn_7.md` | DA | `2026-11-13T01:52:49+02:00` | `Docs/Evidence/180-v2-lateral-learning/README.md` | PASS |
| `181` | Politică extinsă pentru trasee și recuperare | `PBI/Done/181-v2_policy_8.md` | DA | `2026-11-13T02:34:19+02:00` | `Docs/Evidence/181-v2-route-policy/README.md` | PASS |
| `182` | Învățare extinsă pentru trasee și recuperare | `PBI/Done/182-v2_learn_8.md` | DA | `2026-11-13T09:39:07.679+02:00` | `Docs/Evidence/182-v2-route-learning/README.md` | PASS |
| `183` | Politică extinsă pentru pietoni și pericole | `PBI/Done/183-v2_policy_9.md` | DA | `2026-11-13T20:36:04+02:00` | `Docs/Evidence/183-v2-hazard-policy/README.md` | PASS |
| `184` | Învățare extinsă pentru pietoni și pericole | `PBI/Done/184-v2_learn_9.md` | DA | `2026-11-13T21:10:22+02:00` | `Docs/Evidence/184-v2-hazard-learning/README.md` | PASS |
| `185` | Politică extinsă pentru pickup și confortul pasagerilor | `PBI/Done/185-v2_policy_10.md` | DA | `2026-11-13T21:50:58+02:00` | `Docs/Evidence/185-v2-pickup-policy/README.md` | PASS |
| `186` | Învățare extinsă pentru pickup și confortul pasagerilor | `PBI/Done/186-v2_learn_10.md` | DA | `2026-11-13T23:30:53+02:00` | `Docs/Evidence/186-v2-pickup-learning/README.md` | PASS |
| `187` | Validarea tuturor celor 80 de parametri | `PBI/Done/187-gate80.md` | DA | `2026-11-14T00:24:02+02:00` | `Docs/Evidence/187-v2-parameter-gate/README.md` | PASS |
| `188` | Provocări pentru comportamentele extinse | `PBI/Done/188-missions_v2.md` | DA | `2026-11-14T04:20:58+02:00` | `Docs/Evidence/188-v2-challenges/README.md` | PASS |
| `189` | Regresii compatibilitate și performanță V2 | `PBI/Done/189-qa_v2.md` | DA | `2026-11-14T04:54:57.027+02:00` | `Docs/Evidence/189-v2-regression/README.md` | PASS |

**27/27** PBI-uri V2 sunt în `PBI/Done`, cu `status: Done`, `completed_at` completat și un README de dovezi fără „De completat".

## Rândurile deschise

- `inherited-v1-gates` (**FAIL**) — checklist V1 162: 8 PASS, 2 FAIL, 1 NOT_VALIDATED, 2 NOT_RUN (26 itemi deschiși) · owner: proprietarul 235 (experiență) și 153 (QA vizual)
- `fps-hardware` (**NOT_RUN**) — 224: NOT_VALIDATED; capturile hardware 220 sunt pe alt build, pragurile cer aceeași revizie. Nu se raportează FPS headless. · owner: operatorul cu hardware real + proprietarul 224
- `harness-v2` (**NOT_RUN**) — Harness-ul de performanță nu are fixture cu pietoni/pericole: 33 fișiere în tests/harness, 0 referințe de pietoni și 0 de pericole; dovezile 155/156/158/224 au 0 referințe. Măsurarea frame/simulare pe workload-ul V2 cere o pagină de harness și un GPU real, indisponibile aici. · owner: proprietarul harness-ului 220/224
- `soak-v2` (**NOT_RUN**) — soak-ul comis (60,002 min, 20 cicluri) este pe workload-ul V1 și nu a fost reexecutat; nu există variantă cu pietoni/pericole · owner: proprietarul 159/224
- `playtest-human` (**NOT_RUN**) — rândul C3 al regresiei V1 (NOT_RUN) și NOT_RUN în checklist-ul 162: zero participanți · owner: proprietarul 216/235
- `remeasure-224` (**NOT_RUN**) — `npm run perf:gate -- --check` iese cu exit 1; 189 a reexecutat proaspăt doar structural (PASS), fără să suprascrie dovezile comise · owner: proprietarul 224

## Comenzi

```bash
npm run release:v2
npm run release:v2 -- --check
```
