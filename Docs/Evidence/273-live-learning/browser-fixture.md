# 273 — proba de browser deterministă a pipeline-ului live de learning

Generată de `npm run learning:live:fixture`; Chromium 157.0.8103.51, viewport 1360x720.
Fixture: `273-live-learning-browser-v1`. Rulează modulele reale 272/103/221/109/110/205 peste harta reală
032/033; numai transportul `worker_threads` al cozii 103 este înlocuit de harness-ul cu microtask,
ca în testele Node. Nu există o a doua simulare, un al doilea estimator sau un store paralel.

Segmentul LEARNING determinist are 1080 eșantioane 085 reale și fereastra
087 `FREE_TRAFFIC` la tick 1–196.
Capturi: [screenshots/fixture-01-segment.png](screenshots/fixture-01-segment.png), [screenshots/fixture-02-activating.png](screenshots/fixture-02-activating.png), [screenshots/fixture-03-published.png](screenshots/fixture-03-published.png).

## Rezultat

| Fapt | Valoare |
| --- | --- |
| Segment | `browser-composed` |
| Joburi / versiuni | 1 / 1 |
| Versiune imuabilă | `browser-composed~112` (părinte `profile-v1`, adâncime 1) |
| Valoare | speed_delta_residential: 0 → -0.33 |
| Activare | PENDING la tick 2, aplicată la 2 |
| Flotă | 24 taxiuri + 40 civili = 64, versiuni browser-composed~112 |
| Fingerprint profil | `1c4d32b2f4e3829a` → `af1274c24a841c31` |
| Fingerprint XP | `681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e` = `681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e` (NOT_MOUNTED_273) |
| Epoch | 1 |

## Verificări

| Check | Verdict | Expected | Actual | Detaliu |
| --- | --- | --- | --- | --- |
| `pipeline-contract` | PASS | 273-live-learning-v1 | 273-live-learning-v1 | live pipeline 273-live-learning-v1 |
| `segment-closed-eligible` | PASS | true | true | CLOSED/LEARNING/eligible true |
| `segment-sampled` | PASS | true | true | 1080 real 085 samples in ticks 1–1080 |
| `eligible-window-087` | PASS | true | true | id-v1:17:eligibility-entry11:session-1121:192:id-v1:16:opportunity-stop11:session-1121:111:live-player16:live-player:live11:sl:1-1:01E01:0 FREE_TRAFFIC STOP 1–196 (32 observations) |
| `job-submitted` | PASS | 1 | 1 | segment browser-composed |
| `evidence-ready` | PASS | READY | READY | key speed_delta_residential, 1 episodes, candidate CANDIDATE |
| `candidate-ready` | PASS | CANDIDATE | CANDIDATE | value -2.1999998092651367 from real 094/098 estimators |
| `immutable-version` | PASS | true | true | browser-composed~112 parent profile-v1, checksum fnv1a64:8b538607ca7cd5f3, store versions 2 |
| `store-refuses-rewrite` | PASS | VERSION_ID_DUPLICATE | VERSION_ID_DUPLICATE | the same immutable version id cannot be derived a second time |
| `common-tick-activation` | PASS | true | true | PENDING at tick 2, applied 2, callback 2 |
| `activation-once` | PASS | true | true | published 1, applied 1, common tick 2 |
| `city-style-published` | PASS | browser-composed~112 | browser-composed~112 | city style applied at tick 2 |
| `profile-published` | PASS | browser-composed~112 | browser-composed~112 | style profile city-profile source browser-composed |
| `profile-fingerprint-changed` | PASS | true | true | 1c4d32b2f4e3829a -> af1274c24a841c31 |
| `learned-parameter` | PASS | true | true | speed_delta_residential 0 -> -0.33 (LEARNED) |
| `whole-fleet-adopted` | PASS | browser-composed~112 | browser-composed~112 | 24 taxis + 40 civilians = 64, all on version true |
| `xp-untouched` | PASS | 681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e | 681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e | NOT_MOUNTED_273: no XP writer is mounted by 273; digest matches the Node report |
| `no-second-publication` | PASS | true | true | after 6 extra fixed ticks: versions 1, head browser-composed~112 |
| `fixture-status` | PASS | PASS | PASS | terminal fixture status PASS |
| `fixture-checks-present` | PASS | true | true | 18 real checks |
| `no-page-errors` | PASS | 0 | 0 | no page errors |
| `no-console-errors` | PASS | 0 | 0 | no console errors |

Final: **PASS** — toate verificările reale au trecut.

## Limitări

- Aceasta este o probă de fixture determinist în Chromium, nu lumea live jucată cu tastatura; probei
  live îi lipsește fereastra 087 eligibilă în prefixul de 10 s și rămâne raportată separat în
  `browser.json` (4/9), fără PASS simulat.
- Transportul 103 din pagină este harness-ul cu microtask; raportul Node măsoară `WorkerRuntime` real.
- Nu este o măsurătoare FPS/GPU/hardware și nu acoperă UI-ul 274, setările 279, fizica 282 sau
  persistența 278.
