# Raport 212 — progres și interfață pentru misiunile zilei

Determinist, fără browser real și fără ceas de perete. Contract consumat: `212-daily-progress-v1`;
proiecție UI: `212-daily-progress-panel-v1`.

## Rezumat

- verificări: **26/26**, eșecuri 0;
- XP promis 300, XP acordat 200, recompense unice 2;
- curse numărate: 4 (3 MANUAL, 1 AUTO, 0 mixte);
- evenimente respinse explicit: 5, duplicate 1, acceptate 1;
- determinism: 2 rulări, egale true.

## Scenariul principal

| Slot | Instanță | Obiectiv | Mod cerut | Țintă | XP |
| --- | --- | --- | --- | --- | --- |
| 1 | `daily-v1:player:211-daily:2026-11-11:s1:daily-test-manual@1` | MANUAL_DROPOFFS | MANUAL | 2 | 100 |
| 2 | `daily-v1:player:211-daily:2026-11-11:s2:daily-test-clean@1` | CLEAN_DROPOFFS | ANY | 2 | 100 |
| 3 | `daily-v1:player:211-daily:2026-11-11:s3:daily-test-learning@1` | LEARNING_ACTIVATIONS | LEARNING | 1 | 100 |

Progres parțial afișat: 1 din 2 (= 50%). Ultima cursă reală:
`ride:212:manual-2`, 840 → 1080
tick-uri, 4 s, mod MANUAL.

## Refuzuri numărate

- FOREIGN_SESSION: 2
- IRRELEVANT: 1
- NO_RIDE: 1
- STALE_EPOCH: 1

Ultimul refuz: NO_RIDE (livrare fără îmbarcare: intervalul cursei lipsește).

## Limita zilei și reluarea

- `dayStartMs` 1794348000000, `expiresAtMs` 1794434400000 (exclusiv);
- eveniment la `expiresAtMs - 1`: COMPLETED; la `expiresAtMs`: OUTSIDE_DAY;
- obiective expirate: 2, motiv EXPIRED;
- reload: 1 → 1 recompense, XP acordat 100,
  replay DUPLICATE, eveniment nou pe obiectiv încheiat 1,
  recompense la replay 0;
- ziua următoare: NEW_DAY 2026-11-12, rânduri create 3,
  eliminate 3, XP 0, recompense păstrate 1.

## Limitele obiectivului

- fereastră: termen 900, motiv WINDOW_CLOSED;
- buget de incidente: 1 incidente, motiv INCIDENT_BUDGET_EXCEEDED.

## Stările panoului

| Stare | Etichetă | Progres | XP | Motiv |
| --- | --- | --- | --- | --- |
| COMPLETED | Îndeplinit | 2 din 2 | 100 XP acordat | — |
| COMPLETED | Îndeplinit | 2 din 2 | 100 XP acordat | — |
| ACTIVE | În desfășurare | 0 din 1 | 100 XP promis | — |
| EXPIRED | Expirat | 0 din 2 | 100 XP promis | EXPIRED |
| EXPIRED | Expirat | 0 din 2 | 100 XP promis | EXPIRED |
| COMPLETED | Îndeplinit | 1 din 1 | 100 XP acordat | — |
| ACTIVE | În desfășurare | 0 din 2 | 100 XP promis | — |
| INELIGIBLE | Neeligibil | 0 din 2 | 100 XP promis | INCIDENT_BUDGET_EXCEEDED |
| ACTIVE | În desfășurare | 0 din 1 | 100 XP promis | — |

Zi locală: 2026-11-11 (Europe/Bucharest (UTC+02:00)) · Reset: 2026-11-12 00:00 (Europe/Bucharest (UTC+02:00)) · Fus orar: Europe/Bucharest (UTC+02:00)

Cost structural: 61 elemente, 44 noduri text,
3 listeners (0 globali), focus mutat 2,
restaurat 1, Escape 1, Tab wrap 1,
citiri 4, randări 3; închis `SKIPPED_CLOSED`.

## Verificări

| Rezultat | Verificare | Detaliu |
| --- | --- | --- |
| PASS | the day carries exactly three objectives from the 211 set | instances 3, slots 1/2/3 |
| PASS | every objective publishes its promised XP and its control requirement | MANUAL_DROPOFFS:MANUAL/100 XP, CLEAN_DROPOFFS:ANY/100 XP, LEARNING_ACTIVATIONS:LEARNING/100 XP |
| PASS | no reward is granted before an objective is completed | partial 1/?, granted 200 |
| PASS | the partial objective is displayed as its real ratio and percentage | 1 din 2 = 50% |
| PASS | a MANUAL objective counts only real MANUAL ride intervals | manual 2, mismatches 1 |
| PASS | the ride interval is the real PICKUP..DROPOFF pair with its real tick duration | pickup 840 → dropoff 1080 = 240 ticks |
| PASS | a completed objective grants the 211 reward identity exactly once | daily-reward-v1:player:211-daily:daily-v1:player:211-daily:2026-11-11:s1:daily-test-manual@1 |
| PASS | the day keeps one reward per completed objective | rewards 2, XP 200/300 |
| PASS | a foreign session, an old epoch and an irrelevant type are counted refusals | FOREIGN_SESSION=2, IRRELEVANT=1, NO_RIDE=1, STALE_EPOCH=1 |
| PASS | no foreign event advances an objective and no rejection is silent | rejected 5, accepted 1, duplicates 1 |
| PASS | the last rejection is reported with its reason for the UI | 212:dropoff:ride:212:orphan · NO_RIDE |
| PASS | an event one millisecond before the boundary still completes | phase EXPIRED, completed 1 |
| PASS | an event exactly at expiresAtMs is refused as outside the day | rejected 1, phase EXPIRED |
| PASS | incomplete objectives are explicitly EXPIRED, never ambiguous | MANUAL_DROPOFFS:EXPIRED, CLEAN_DROPOFFS:EXPIRED, LEARNING_ACTIVATIONS:COMPLETED |
| PASS | a reload restores the same completed row and the same single reward | rewards 1, XP 100, rebound true |
| PASS | replaying the same day is a duplicate and a new event cannot pay again | DUPLICATE, ACCEPTED, rewards 0, afterCompletion 1 |
| PASS | a new local day creates three new rows and keeps the old reward | NEW_DAY 2026-11-12: created 3, dropped 3, retained rewards 1 |
| PASS | a declared evaluation window closes late events with WINDOW_CLOSED | progress 1, deadline 900, reason WINDOW_CLOSED |
| PASS | an exceeded incident budget stops the objective with a counted reason | collisions 1/0, reason INCIDENT_BUDGET_EXCEEDED |
| PASS | the panel renders every state with its real label | COMPLETED=Îndeplinit, COMPLETED=Îndeplinit, ACTIVE=În desfășurare, EXPIRED=Expirat, EXPIRED=Expirat, COMPLETED=Îndeplinit, ACTIVE=În desfășurare, INELIGIBLE=Neeligibil, ACTIVE=În desfășurare |
| PASS | the expired and ineligible states carry a readable reason | ziua s-a încheiat înainte de îndeplinire / bugetul de incidente a fost depășit |
| PASS | the panel shows the time zone, the reset moment and the promised XP | Fus orar: Europe/Bucharest (UTC+02:00) · Reset: 2026-11-12 00:00 (Europe/Bucharest (UTC+02:00)) |
| PASS | the panel keeps zero global listeners and one read per open | listeners 3, global 0, reads 4 |
| PASS | Escape closes, focus is restored and Tab stays inside the panel | escapes 1, restores 1, wraps 1 |
| PASS | two identical runs produce the same read model | runs 2, equal true |
| PASS | the declined read model is refused when it contradicts the contracts | satisfied flag contradicting its target is refused |
