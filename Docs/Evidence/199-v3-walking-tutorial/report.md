# 199 — tutorial și misiuni pentru mers și vehicule

Transcript determinist generat de `npm run walking:tutorial`; contract `199-walking-tutorial-v1`.
Machine-readable: [report.json](report.json). Fără ceas, cadru, browser sau sursă aleatoare: fiecare
pas avansează numai dintr-un fapt livrat de modulul proprietar.

## Sumar

- Pași: **6**, avansați din evenimentul lor real: **6/6**.
- Verificări negative (eveniment greșit → nimic nu avansează): **30** sonde, toate refuzate.
- Criteriul 1 (flotă, catalog 231, provocări 188, daily, misiuni, deblocări, acces): **PASS**.
- Fără learning: **PASS**.
- Determinism: 2 rulări, digest `sha256:e3c83000985001c76f6f9ebed6a94a8e45067862a8c87a278b2e86c767a3f898`.
- Verificări: **10/10**.
- Verdict general: **PASS**.

## Pas → eveniment → avansat?

| # | Pas | Eveniment (sursă) | Tick | Stare | Avansat | Dovadă |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1 | `SELECT_TAXI` | `TAXI_SELECTION` (068) | 5 | `SATISFIED` | DA | `selection:5:vehicle:taxi-199` |
| 2 | `WALK_TO_TAXI` | `WALKER_MOTION` (192) | 11 | `SATISFIED` | DA | `walk:11:0.018333` |
| 3 | `ENTER_VEHICLE` | `VEHICLE_ENTRY` (195) | 200 | `SATISFIED` | DA | `entry:200:vehicle:taxi-199` |
| 4 | `BOARD_PASSENGER` | `RIDE_PICKUP` (007) | 210 | `SATISFIED` | DA | `199:pickup:210:ride:199-1` |
| 5 | `FINISH_RIDE` | `RIDE_DROPOFF` (007) | 220 | `SATISFIED` | DA | `199:dropoff:220:ride:199-1` |
| 6 | `EXIT_VEHICLE` | `VEHICLE_EXIT` (196) | 230 | `SATISFIED` | DA | `exit:230:vehicle:taxi-199` |

Fiecare pas are un singur eveniment care îl poate satisface: `true`
este politică publicată, iar sursele sunt `TAXI_SELECTION` → 068, `WALKER_MOTION` → 192, `VEHICLE_ENTRY` → 195, `RIDE_PICKUP` → 007, `RIDE_DROPOFF` → 007, `VEHICLE_EXIT` → 196.

## Refuz negativ per pas

| Pas | Eveniment așteptat | Eveniment real introdus | Tick | Stare | Motiv | Avansat | Rezultat |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `SELECT_TAXI` | `TAXI_SELECTION` | `WALKER_MOTION` | 1 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `SELECT_TAXI` | `TAXI_SELECTION` | `VEHICLE_ENTRY` | 1 | `IGNORED` | `FOREIGN_VEHICLE` | NU | PASS |
| `SELECT_TAXI` | `TAXI_SELECTION` | `RIDE_PICKUP` | 1 | `IGNORED` | `NO_SELECTED_TAXI` | NU | PASS |
| `SELECT_TAXI` | `TAXI_SELECTION` | `RIDE_DROPOFF` | 1 | `IGNORED` | `NO_SELECTED_TAXI` | NU | PASS |
| `SELECT_TAXI` | `TAXI_SELECTION` | `VEHICLE_EXIT` | 1 | `IGNORED` | `FOREIGN_VEHICLE` | NU | PASS |
| `WALK_TO_TAXI` | `WALKER_MOTION` | `TAXI_SELECTION` | 6 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `WALK_TO_TAXI` | `WALKER_MOTION` | `VEHICLE_ENTRY` | 6 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `WALK_TO_TAXI` | `WALKER_MOTION` | `RIDE_PICKUP` | 6 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `WALK_TO_TAXI` | `WALKER_MOTION` | `RIDE_DROPOFF` | 6 | `IGNORED` | `RIDE_NOT_BOARDED` | NU | PASS |
| `WALK_TO_TAXI` | `WALKER_MOTION` | `VEHICLE_EXIT` | 6 | `IGNORED` | `FOREIGN_VEHICLE` | NU | PASS |
| `ENTER_VEHICLE` | `VEHICLE_ENTRY` | `TAXI_SELECTION` | 11 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `ENTER_VEHICLE` | `VEHICLE_ENTRY` | `WALKER_MOTION` | 11 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `ENTER_VEHICLE` | `VEHICLE_ENTRY` | `RIDE_PICKUP` | 11 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `ENTER_VEHICLE` | `VEHICLE_ENTRY` | `RIDE_DROPOFF` | 11 | `IGNORED` | `RIDE_NOT_BOARDED` | NU | PASS |
| `ENTER_VEHICLE` | `VEHICLE_ENTRY` | `VEHICLE_EXIT` | 11 | `IGNORED` | `FOREIGN_VEHICLE` | NU | PASS |
| `BOARD_PASSENGER` | `RIDE_PICKUP` | `TAXI_SELECTION` | 201 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `BOARD_PASSENGER` | `RIDE_PICKUP` | `WALKER_MOTION` | 201 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `BOARD_PASSENGER` | `RIDE_PICKUP` | `VEHICLE_ENTRY` | 201 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `BOARD_PASSENGER` | `RIDE_PICKUP` | `RIDE_DROPOFF` | 201 | `IGNORED` | `RIDE_NOT_BOARDED` | NU | PASS |
| `BOARD_PASSENGER` | `RIDE_PICKUP` | `VEHICLE_EXIT` | 201 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `FINISH_RIDE` | `RIDE_DROPOFF` | `TAXI_SELECTION` | 211 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `FINISH_RIDE` | `RIDE_DROPOFF` | `WALKER_MOTION` | 211 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `FINISH_RIDE` | `RIDE_DROPOFF` | `VEHICLE_ENTRY` | 211 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `FINISH_RIDE` | `RIDE_DROPOFF` | `RIDE_PICKUP` | 211 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `FINISH_RIDE` | `RIDE_DROPOFF` | `VEHICLE_EXIT` | 211 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `EXIT_VEHICLE` | `VEHICLE_EXIT` | `TAXI_SELECTION` | 221 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `EXIT_VEHICLE` | `VEHICLE_EXIT` | `WALKER_MOTION` | 221 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `EXIT_VEHICLE` | `VEHICLE_EXIT` | `VEHICLE_ENTRY` | 221 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `EXIT_VEHICLE` | `VEHICLE_EXIT` | `RIDE_PICKUP` | 221 | `IGNORED` | `WRONG_STEP` | NU | PASS |
| `EXIT_VEHICLE` | `VEHICLE_EXIT` | `RIDE_DROPOFF` | 221 | `IGNORED` | `RIDE_NOT_BOARDED` | NU | PASS |

Sondele sunt fapte reale ale altui modul (selecție 068, mișcare 192, intrare 195, pickup/dropoff 007,
ieșire 196), nu documente malformate. Fiecare este refuzată fără să schimbe progresul.

## Reluare și abandon

- Aceeași secvență, două rulări: `sha256:6b87e70aca1a1977de87a48b63ca7cb98a29c1096497e4178315cd55f01d4a53` / `sha256:6b87e70aca1a1977de87a48b63ca7cb98a29c1096497e4178315cd55f01d4a53`, identice `true`.
- Fapte rejucate pe tutorialul complet: progres stabil `true`, pași acceptați 6.
- Abandonat la mijloc: stare `ABANDONED`, pas 2/6, digest `sha256:4f6fa55dd89a4fdd32beddce5c5f2d8a4847f06e2a25edffbeb9e146878b9592`, taxiuri blocate 0.
- Sărit complet: stare `COMPLETED`, `SKIP`, pași săriți 5.

## Fără learning

- Joburi de learning: 0, versiuni de profil: 0, demonstrații: 0.
- Candidați de estimator produși de tutorial: 0.
- Martor 198: 120 tick-uri de mers → 0 segmente, 0 candidați; un segment LEARNING închis produce 1 candidat, deci poarta nu este tautologică.
- `PROFILE_ACTIVATE` observate ca dovadă: 0; nu avansează niciun pas.
- XP acordat: 0; XP pentru timpul de mers: `NOT_IMPLEMENTED` (limitare explicită, nu simulată).

## Snapshot de compatibilitate V1

| Componentă | Înainte | După tutorial complet | După tutorial abandonat |
| --- | --- | --- | --- |
| Catalog 231 | `sha256:8b16253fcd4d8792f2f66dc4468cc3614175dc6935af1597b6a3cb97704d6f89` | `sha256:8b16253fcd4d8792f2f66dc4468cc3614175dc6935af1597b6a3cb97704d6f89` | `sha256:8b16253fcd4d8792f2f66dc4468cc3614175dc6935af1597b6a3cb97704d6f89` |
| Provocări 188 | `sha256:2f1708b5e95ce61c43181f46756f795aec66e427ada1442686124be9b6e7f913` | `sha256:2f1708b5e95ce61c43181f46756f795aec66e427ada1442686124be9b6e7f913` | `sha256:2f1708b5e95ce61c43181f46756f795aec66e427ada1442686124be9b6e7f913` |
| Daily 211 | `sha256:62fb673902333d1a9ea3a487676064802c8ebc31ea6fa5e4bc6921a1dd2df052` | `sha256:62fb673902333d1a9ea3a487676064802c8ebc31ea6fa5e4bc6921a1dd2df052` | `sha256:62fb673902333d1a9ea3a487676064802c8ebc31ea6fa5e4bc6921a1dd2df052` |
| Progres 125 | `sha256:368822f6e5bf0b783fed389843863c2b1eca9bf41de1e49c49bf91f7c5ef2ea3` | `sha256:368822f6e5bf0b783fed389843863c2b1eca9bf41de1e49c49bf91f7c5ef2ea3` | `sha256:368822f6e5bf0b783fed389843863c2b1eca9bf41de1e49c49bf91f7c5ef2ea3` |
| Deblocări 125 | `sha256:f4771c8335357442648e94189bef2ad6ff4c17074be6e08c5d699f150c265017` | `sha256:f4771c8335357442648e94189bef2ad6ff4c17074be6e08c5d699f150c265017` | `sha256:f4771c8335357442648e94189bef2ad6ff4c17074be6e08c5d699f150c265017` |
| Acces flotă 125 | `sha256:29eb133a97582c17cab46432d666f5c88c122b2817b8c166e0f7178744716a98` | `sha256:29eb133a97582c17cab46432d666f5c88c122b2817b8c166e0f7178744716a98` | `sha256:29eb133a97582c17cab46432d666f5c88c122b2817b8c166e0f7178744716a98` |
| Player progress 213 | `sha256:bf123d04969c9885de658a66f856057a637676a846187ab490c5beb9873771f9` | `sha256:bf123d04969c9885de658a66f856057a637676a846187ab490c5beb9873771f9` | `sha256:bf123d04969c9885de658a66f856057a637676a846187ab490c5beb9873771f9` |
| Snapshot complet | `sha256:7845ca3ceaf90076ae9b2e0575f445fd9c4a13cd659ecf23219facebccd32035` | `sha256:7845ca3ceaf90076ae9b2e0575f445fd9c4a13cd659ecf23219facebccd32035` | `sha256:7845ca3ceaf90076ae9b2e0575f445fd9c4a13cd659ecf23219facebccd32035` |

Catalog 231: 12 template-uri; provocări 188: 15 (total 27); misiuni de campanie: 8; daily 2026-11-15: 3 instanțe; misiuni finalizate 0; deblocări 4; flotă 64 vehicule, 24 taxiuri, 64 conduse, 24 selectabile, revocate 0, taxiuri blocate 0. Misiune V1 `campaign-1-first-taxi`: `COMPLETED` (digest `sha256:735ead62deb61ebbf97fe999ad86e09c96c8c71e7b91cf7babdad6278a7d7cbf`).

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
| `one-event-per-step` | 6 | 6 | PASS | Fiecare pas satisface exact evenimentul pe care îl declară. |
| `negative-per-step` | 30 | 30 | PASS | Fiecare pas refuză toate celelalte cinci evenimente reale. |
| `no-double-check` | true | true | PASS | Progresul nu se dublează când faptele sunt rejucate. |
| `criterion-1-fleet` | true | true | PASS | Catalog 231, provocări 188, daily, misiuni, deblocări, acces și player progress bit-identice. |
| `criterion-1-v1-mission` | COMPLETED | COMPLETED | PASS | O misiune V1 se finalizează prin tracker-ul real 116 după tutorial. |
| `no-learning` | 0 | 0 | PASS | Nicio cale de la tutorial la un candidat de estimator; poarta 198 rămâne funcțională. |
| `taxi-access` | true | true | PASS | Accesul la taxiuri nu este filtrat niciodată de tutorial. |
| `replay-identical` | sha256:6b87e70aca1a1977de87a48b63ca7cb98a29c1096497e4178315cd55f01d4a53 | sha256:6b87e70aca1a1977de87a48b63ca7cb98a29c1096497e4178315cd55f01d4a53 | PASS | Aceeași secvență produce aceeași stare finală. |
| `serializable` | true | true | PASS | Starea trece prin JSON și prin parserul strict fără pierderi. |
| `walking-xp-explicit` | 0 | 0 | PASS | XP de timp pentru mers nu este implementat aici și nu este simulat. |

## Limitări

- XP pentru timpul de mers nu este implementat aici; Docs/20 îl permite, contractul îl raportează explicit ca NOT_IMPLEMENTED și nu îl simulează.
- Tutorialul este un contract headless: UI-ul, tastatura și HUD-ul rămân ale modulelor existente; proba folosește stări 192 și decizii 195/196 reale, nu un browser.
- Provocările 231/188, misiunile zilnice și deblocările sunt citite ca snapshot comparativ, nu modificate: tutorialul nu are nicio legătură de scriere cu ele.
- Reluarea este idempotentă pe progres, nu pe contoarele de dovadă: un fapt rejucat este refuzat, dar numărul de observații crește, exact ca la 117.
