# Raport determinist 228 — feedback audio-vizual și replay al distrugerii

Contract: `228-destruction-feedback-v1` · fixture `228-destruction-feedback-v1`.

## Materiale și profiluri acustice

| Arhetip | Material | Cue | Playback rate | Gain | Fragmente | Simbol |
| --- | --- | --- | --- | --- | --- | --- |
| FENCE_LIGHT | WOOD | impact | 0.82 | 0.55 | 2 | ▤ |
| CONE | PLASTIC | impact | 1.25 | 0.35 | 2 | ▲ |
| CRATE | WOOD | impact | 0.7 | 0.7 | 2 | ▣ |
| BIN | METAL | impact | 1.05 | 0.8 | 2 | ◍ |
| DECOR_SIGN | GLASS | impact | 1.45 | 0.9 | 2 | ✦ |
| STREET_FURNITURE | METAL | impact | 0.6 | 1 | 2 | ▦ |

Profiluri distincte: 6/6 · materiale: 4.

## Feedback live

Evenimente 5, reacții 5, absente 0, listeners 1.
Audio: 4 redate, 1 refuzate, 1 buffere; rate-uri 1.25, 0.7, 1.05, 1.45.
Fragmente: active 10, vârf 10, plafon 192, durată 120 tick-uri; trafic false, scor false, coliziuni false.

## Gest și contract audio 148

Înainte de gest: IDLE, contexte 0, voci 0, redate 0, refuzate 1.
După gest: RUNNING, contexte 1, voci 1, redate 1.

## Adevărul replay-ului (207 → 141 → 228)

Chunk `session-227-destructible:incident:collision:228:report` (3851 B, PARTIAL), 3 evenimente de distrugere.
Replay: 3/3 evenimente, ordine true, identice true, reacții inventate 0, pași de simulare 0, recompense 0.
Amprente reacții identice: true · audio 2 redate / 1 refuzate.
Proiecție: generație 0, reseturi 0, obiecte BROKEN 3.
Reset înregistrat: 1 eveniment, generația 1, stări post-reset 1, reacții 2.

## Eveniment absent

Live 3 distrugeri, înregistrate 2; replay redă 2 reacții și lasă 1 obiecte fără sunet/efect.

## Reset și bugete

Reset: voci 2 → 0, fragmente 4 → 0, buffere 1; reacții după generația nouă 3.
Burst: 30 evenimente → 24 reacții, 6 refuzate de plafon, 4 voci impact.
Manifest 203-initial-1 (FIXED_INITIAL_CONTRACT_WITH_PROVISIONAL_GAMEPLAY_BUDGETS): destructionBodies null, totalHeapBytes null.

Lacune de buget:
- destructionBodies is null in the manifest
- totalHeapBytes is null in the manifest
- no destruction feedback budget exists in the manifest; the 228 caps are local

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
| every archetype has a distinct material acoustic profile | 6 | 6 | PASS |
| one reaction per live DESTRUCTIBLE_BROKEN event | 5 | 5 | PASS |
| the live feedback installs exactly one listener | 1 | 1 | PASS |
| the impact voice cap is respected | true | true | PASS |
| no audio context exists before the player gesture | 0 | 0 | PASS |
| a destruction before the gesture is silent | 0 | 0 | PASS |
| the same reaction sounds after the gesture | 1 | 1 | PASS |
| zero volume keeps the reaction and silences only the output | true | true | PASS |
| the replay repeats the recorded events in the recorded order | true | true | PASS |
| the replay reaction fingerprints equal the live derivation | true | true | PASS |
| the replay steps no simulation and grants no reward | 0 | 0 | PASS |
| the projected states match the live 227 states | true | true | PASS |
| the absent event produces no reaction and no cue | true | true | PASS |
| a recorded reset starts a new generation in the replay | 1 | 1 | PASS |
| the replay clears the pre-reset states and keeps the post-reset ones | true | true | PASS |
| reset returns the voices and the fragment pool to the baseline | true | true | PASS |
| a new generation after reset has a new event identity | true | true | PASS |
| a burst respects the per-incident reaction cap | 24 | 24 | PASS |
| a burst respects the 148 impact voice cap | true | true | PASS |
| the budget gaps are declared | 0 | 0 | PASS |

Rezumat: 20/20 verificări, PASS. FPS, heap și hardware nu sunt pretinse.

