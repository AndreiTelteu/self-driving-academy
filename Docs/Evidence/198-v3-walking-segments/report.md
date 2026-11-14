# 198 — intervenții și telemetrie cu personaj

Transcript determinist generat de `scripts/run-v3-walking-segments-report.mjs`; comanda comisă este `npm run walking:segments`.
Machine-readable: [report.json](report.json). Contract: `198-walking-segments-v1`, tick fix la
60 Hz, mod implicit la intrare `MANUAL` (exact
`VEHICLE_ENTRY_POLICY.entryMode` din 195), feluri de segment `MANUAL` / `LEARNING`,
motive de închidere `RETURN_TO_AUTO` / `VEHICLE_SWITCH`.

Poarta estimatorului, copiată din 069: LEARNING ∧ learningEligible ∧ CLOSED ∧ same session/player/profile/epoch/baseVersion.

## Sumar

- Scenarii trecute: **16/16**.
- Criteriul 1a (mersul nu este driving: mii de tick-uri, 0 segmente, 0 candidați): **PASS**.
- Criteriul 1b (numai LEARNING închis produce estimator, inclusiv segmentul trunchiat): **PASS**.
- Criteriul 2 (matricea mod anterior × tranziție păstrează autoritatea unică și modul explicit): **PASS**.
- FOCUS nu închide nimic: **PASS**.
- Determinism: 2 rulări identice: **DA**, SHA-256 `87a00a30855732eab84029ace8638843c5eb16e1389b3bd9b66ca1e03ecb14c2`.
- Verdict general: **PASS**.

## Dovada „mers = 0 segmente"

| Probă | Tick-uri de mers | Distanță parcursă (m) | Segmente de driving | Candidați | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| viteză reală (1,3710 m/s ÷ 60 Hz) | 3600 | 82.26 | 0 | 0 | PASS |
| plafonul „oricât" (50 m/tick) | 1000 | 50000.00 | 0 | 0 | PASS |

Același model produce exact 1 segment când autoritatea părăsește
într-adevăr corpul (ENTER urmat de EXIT): dovada nu este tautologică. `WALK` este singura tranziție
care numără tick-uri și metri; nu are cale de creare de segment și nici de candidat.

## Tranziție → segment închis → fel → candidați → verdict

| Scenariu | Descriere | Tranziții | Mod anterior | Autoritate | Segment închis | Fel | Motiv | Manevră întreruptă | Candidați | Segment deschis | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| `walk-3600` | 3600 tick-uri de mers la viteza reală a clipului walk (1,3710 m/s) | WALK × 3600 → ENTER → EXIT | — | `CHARACTER:character:player-character` → `CHARACTER:character:player-character` | `198:segment:1` | `MANUAL` | `RETURN_TO_AUTO` | — | 0 | — | PASS |
| `walk-unbounded` | 1000 tick-uri cu 50 m/tick (50 km parcurși): plafonul „oricât" | WALK × 1000 | — | `CHARACTER:character:player-character` → `CHARACTER:character:player-character` | — | — | — | — | 0 | — | PASS |
| `manual-closed` | segment MANUAL închis de ieșire | ENTER → EXIT | `MANUAL` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `MANUAL` | `RETURN_TO_AUTO` | — | 0 | — | PASS |
| `learning-closed` | segment LEARNING închis de ieșire | ENTER (LEARNING) → EXIT | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `LEARNING` | `RETURN_TO_AUTO` | — | 1 | — | PASS |
| `learning-ineligible` | LEARNING deschis când ținta nu este eligibilă | ENTER (LEARNING) → EXIT | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `LEARNING` | `RETURN_TO_AUTO` | — | 0 | — | PASS |
| `learning-truncated-maneuver` | LEARNING trunchiat de o ieșire în mijlocul manevrei LANE_CHANGING | ENTER (LEARNING) → EXIT | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `LEARNING` | `RETURN_TO_AUTO` | `LANE_CHANGING` | 1 | — | PASS |
| `take-learning-to-manual` | TAKE dintr-un segment LEARNING nu ghicește LEARNING | ENTER A (LEARNING) → ENTER B | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `VEHICLE:vehicle:taxi-b-198` | `198:segment:1` | `LEARNING` | `VEHICLE_SWITCH` | — | 1 | `MANUAL` | PASS |
| `take-manual-to-learning` | TAKE cu alegere explicită LEARNING | ENTER A → ENTER B (LEARNING) | `MANUAL` | `VEHICLE:vehicle:taxi-a-198` → `VEHICLE:vehicle:taxi-b-198` | `198:segment:1` | `MANUAL` | `VEHICLE_SWITCH` | — | 0 | `LEARNING` | PASS |
| `focus-during-learning` | FOCUS în timpul unui segment LEARNING | ENTER (LEARNING) → FOCUS → EXIT | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `LEARNING` | `RETURN_TO_AUTO` | — | 1 | — | PASS |
| `focus-during-manual` | FOCUS în timpul unui segment MANUAL | ENTER (MANUAL) → FOCUS → EXIT | `MANUAL` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `MANUAL` | `RETURN_TO_AUTO` | — | 0 | — | PASS |
| `matrix-manual-take` | mod anterior MANUAL × TAKE | ENTER (MANUAL) → TAKE | `MANUAL` | `VEHICLE:vehicle:taxi-a-198` → `VEHICLE:vehicle:taxi-b-198` | `198:segment:1` | `MANUAL` | `VEHICLE_SWITCH` | — | 0 | `MANUAL` | PASS |
| `matrix-manual-return` | mod anterior MANUAL × RETURN | ENTER (MANUAL) → RETURN | `MANUAL` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `MANUAL` | `RETURN_TO_AUTO` | — | 0 | — | PASS |
| `matrix-manual-focus` | mod anterior MANUAL × FOCUS | ENTER (MANUAL) → FOCUS | `MANUAL` | `VEHICLE:vehicle:taxi-a-198` → `VEHICLE:vehicle:taxi-a-198` | — | — | — | — | 0 | — | PASS |
| `matrix-learning-take` | mod anterior LEARNING × TAKE | ENTER (LEARNING) → TAKE | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `VEHICLE:vehicle:taxi-b-198` | `198:segment:1` | `LEARNING` | `VEHICLE_SWITCH` | — | 1 | `MANUAL` | PASS |
| `matrix-learning-return` | mod anterior LEARNING × RETURN | ENTER (LEARNING) → RETURN | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `CHARACTER:character:player-character` | `198:segment:1` | `LEARNING` | `RETURN_TO_AUTO` | — | 1 | — | PASS |
| `matrix-learning-focus` | mod anterior LEARNING × FOCUS | ENTER (LEARNING) → FOCUS | `LEARNING` | `VEHICLE:vehicle:taxi-a-198` → `VEHICLE:vehicle:taxi-a-198` | — | — | — | — | 0 | — | PASS |

## Matricea de moduri (mod anterior × tranziție)

| Mod anterior | Tranziție | Segment închis | Motiv | Segment deschis | Candidați | Verdict |
| --- | --- | --- | --- | --- | ---: | --- |
| `MANUAL` | `TAKE` | `MANUAL` | `VEHICLE_SWITCH` | `MANUAL` | 0 | PASS |
| `MANUAL` | `RETURN` | `MANUAL` | `RETURN_TO_AUTO` | — | 0 | PASS |
| `MANUAL` | `FOCUS` | — | — | — | 0 | PASS |
| `LEARNING` | `TAKE` | `LEARNING` | `VEHICLE_SWITCH` | `MANUAL` | 1 | PASS |
| `LEARNING` | `RETURN` | `LEARNING` | `RETURN_TO_AUTO` | — | 1 | PASS |
| `LEARNING` | `FOCUS` | — | — | — | 0 | PASS |

Un `TAKE` deschide `MANUAL` dacă nu primește o alegere explicită `LEARNING`: faptul că segmentul
anterior era `LEARNING` nu este o dovadă despre modul următor. `RETURN` închide și nu deschide nimic.
`FOCUS` copiază autoritatea 193 și nu atinge niciun segment.

## Poarta 069 — aceeași regulă, verificată pe ciclul de viață real

| Caz | Mod | `learningEligible` înghețat | Completitudine | Intrări reale 069 | Candidați 198 | Acord |
| --- | --- | --- | --- | ---: | ---: | --- |
| MANUAL închis (RETURN_TO_AUTO) | `MANUAL` | NU | `CLOSED` | 0 | 0 | DA |
| LEARNING închis (RETURN_TO_AUTO) | `LEARNING` | DA | `CLOSED` | 1 | 1 | DA |
| LEARNING cu țintă neeligibilă | `LEARNING` | NU | `CLOSED` | 0 | 0 | DA |
| LEARNING trunchiat de ieșire (VEHICLE_SWITCH) | `LEARNING` | DA | `CLOSED` | 1 | 1 | DA |
| LEARNING cu ținta schimbată după deschidere | `LEARNING` | DA | `CLOSED` | 1 | 1 | DA |
| LEARNING retras cu DATA_LOSS | `LEARNING` | DA | `INCOMPLETE` | 0 | 0 | DA |

Ciclul de viață real 069 (`tests/telemetry/manual-segments-fixture.ts`) este închis de aceleași
granițe de autoritate. Rezultatele coincid: `DA`. Un segment
trunchiat de o ieșire în mijlocul manevrei rămâne `CLOSED` și eligibil, pentru că 069 nu are regulă
de manevră completă; numai `DATA_LOSS` produce `INCOMPLETE`, iar atunci nici 069 și nici acest
contract nu admit un candidat. Eligibilitatea se îngheață la deschidere: o schimbare ulterioară a
țintei nu descalifică retroactiv segmentul.

## Determinism

2 construcții complete ale raportului, identice;
amprenta SHA-256 a raportului este `87a00a30855732eab84029ace8638843c5eb16e1389b3bd9b66ca1e03ecb14c2`. Starea segmentului este date pure,
înghețate, cu parser strict invers (`parseWalkingSegmentsState`), gata pentru 200.

## Limitări

- Contractul este un read model: nu scrie în telemetrie și nu lansează analiza; consumatorul real rămâne 069.
- Candidatul expune intrarea în poarta 069, nu descriptorul 069: operationId și recordBytes aparțin proprietarului telemetriei.
- Ținta (player/profile/epoch/baseVersion) este fixă pe durata instanței; schimbările de profil sunt granițe PROFILE_CHANGE ale 069, nu ale acestui contract.
- Tranzițiile acceptate sunt singurele intrări: un TAKE refuzat de 195/197 nu ajunge aici, deci nu există segment pentru el.
- Completeness INCOMPLETE (DATA_LOSS) este modelată în poartă, dar contractul nu produce tranziții de pierdere de date.
- Modul nu simulează mașina: durata conducerii se citește din startTick/endTick, iar starea manevrei este cea raportată de proprietarul 024.
