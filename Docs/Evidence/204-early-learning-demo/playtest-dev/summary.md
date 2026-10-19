# Developer self-test — interactive 204 playtest

**Label: developer self-test, not a participant.** This directory contains no participant record and no invented answers. The participant folder `../playtest/` remains empty.

## Environment

- Worktree: `C:\Users\aandr\Sites\self-driving-academy\.worktrees\204-playtest`
- Branch: `loop-pbi/204-playtest`
- Date: 19 October 2026
- OS: Windows NT 10.0.26300.0
- Browser: Google Chrome 155.0.8059.84, headless, `--enable-unsafe-swiftshader`
- Runtime: Volta Node 24.21.0 / npm 11.19.0
- Server: `volta run --node 24.21.0 --npm 11.19.0 -- npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
- URL: `http://127.0.0.1:5173/tests/browser/early-learning-playtest.html?selftest=1`

The first Vite dependency optimization after a cold cache took several minutes and produced the `[optimizer] scanning/bundling dependencies` messages; it is a cache warm-up, not page work. Later loads were immediate. Babylon reported `WebGPU1 engine` in the page console. No frame-time or GPU performance claim is made.

## Method

The page was driven through Chrome DevTools Protocol. The developer self-test hook is available only with `?selftest=1`. It drives `W`/`S` through synthetic `KeyboardEvent`s on `document`, which reach the real 025 keyboard filter and binding. The snapshot reported **0 direct fallbacks** in both runs, so the events were accepted by the real input path. The run was ended with the page's own Finish path after three resolved STOP episodes (65.7 s), not with the 5:00 timer.

## LEARNING run

Observed drive (real page samples, no synthetic fact injection):

| Measure | Value |
| --- | ---: |
| Ticks / elapsed | 3943 ticks / 65.7 s |
| Distance | 560 m |
| Maximum speed | 10.77 m/s (39 km/h) |
| Free-driving windows | 3 |
| Acceleration episodes | 4 |
| STOP approaches / full / rolling | 3 / 3 / 0 |
| Abandoned approaches | 0 |
| 085-style samples | 3943 |

Before/after from `composeEarlyLoopProfile` and `compileEarlyLoopControllerProfiles('AUTO', …)`:

| Key | Before | Candidate | After | Delta | Quality | Episodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `speed_delta_urban` | 0 | 0.749022 | 0.187255 | +0.187255 | 1.00 | 3 |
| `desired_acceleration` | 1.5 | 4.519165 | 2.254791 | +0.754791 | 1.00 | 4 |
| `stop_full_probability` | 0.6 | 1.0 | 0.7 | +0.1 | 1.00 | 3 |

The learned profile version was `204-playtest-base-v1-204-early`. The remaining 77 of 80 parameters were not touched. The changes are the documented 25% × quality blend, not the raw candidate: the panel shows both the candidate and the applied value.

AUTO handoff, observed on the same page and car after the finish:

- AUTO became active immediately after the panel (`autoActive: true`).
- Cruise target was posted limit 10 m/s + the learned `speed_delta_urban` 0.187255 = 10.187255 m/s; the observed AUTO cruise settled around 10.04 m/s (the controller's tracking, not the target itself).
- At tick 4572 the 051 policy returned `APPROACH / STOP_APPROACH`; the car braked from 10.04 m/s.
- At tick 5208 the policy returned `HOLD / STOP_HOLD`; the car was near the stop point and the dwell was in progress.
- The next observed sample was cruise again, i.e. the dwell released and AUTO resumed. The trace then approached the following STOP line (`APPROACH / STOP_APPROACH` at tick 5957).
- 213 samples at 10 Hz are in `autoDemo` in the JSON; three distinct decisions were observed: cruise, approach, hold.
- Zero page exceptions.

## MANUAL run

The same page and the same synthetic driving script were used with the MANUAL selector:

| Measure | Value |
| --- | ---: |
| Ticks / elapsed | 3942 ticks / 65.7 s |
| Distance | 560 m |
| Free-driving windows / acceleration episodes | 3 / 4 |
| STOP approaches / full / rolling | 3 / 3 / 0 |
| Evidence episodes | 0 |
| Maximum parameter delta | 0 |
| Profile unchanged | true |
| LEARNING tokens | null |
| AUTO activated | false |
| `autoDemo` samples | 0 |

All three keys stayed exactly at their base values with `NO_EVIDENCE` and the reason “MANUAL: nicio dovadă nu a fost înregistrată”. The raw driving facts still exist for display (3 full stops were driven), but none becomes learning evidence. This is the page-level proof of requirement 4, not just a unit-test claim.

## Files

- `developer-self-test.json` — the LEARNING export (`204-playtest-v2`, `developerSelfTest: true`, `participantSlot: null`, label “developer self-test, not a participant”). Includes the questionnaire answers, session numbers, before/after profile, 10 Hz trace and AUTO decisions.
- `developer-self-test-manual.json` — the MANUAL export with the same label.
- `result-panel.png` — the LEARNING result panel during the AUTO stop approach.
- `result-panel-manual.png` — the MANUAL result panel with zero evidence.

## What this does not prove

- It is not a participant session. The five real participants and the “at least four of five” target remain open.
- It is not a performance, GPU, fleet, collision or full-game measurement.
- The 5:00 automatic finish was not exercised in these two developer runs; both used the explicit Finish control after three stops. The page's timer path is implemented but must be observed in a real five-minute session.
- The scene is the documented simplified straight corridor; the other three taxis and two civilians are visual actors only.
- The 085-style facts are an adapted subset produced by the playtest recorder, not the production 069/085 recorder.
- The profile remains in memory for AUTO only; no `LEARNED` publication or persistence is claimed.
