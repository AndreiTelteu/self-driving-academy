# Raport feedback audio 149

Versiune contract: `149-audio-feedback-v1`.

## Scenarii

### gesture-required

Without a player gesture the engine refuses the cue; the visual twin of the takeover is still shown.

- status: AWAITING_GESTURE
- voices: 0
- visuals: 1
- awaitingGesture: 1

### takeover

The real 007 MANUAL_START event becomes one takeover cue; the relayed and the direct repetition sound nothing.

- cues: takeover-notice
- busStatus: duplicate
- directStatus: DUPLICATE
- duplicates: 1
- visual: Preluare control · taxi-2 · MANUAL

### publication

The 007 PROFILE_ACTIVATE event and the 079 publication notification share one key: the profile sounds once.

- cues: profile-notice
- notificationStatus: DUPLICATE
- duplicates: 1
- visual: Profil publicat · style:149:v3

### late-result

A validated candidate is an analysis result, not a publication; the late publication sounds its own real outcome.

- cues: takeover-notice,ui-tick,profile-notice
- analysisCue: ui-tick
- lateFlag: true
- lateCue: profile-notice

### rapid-toggle

Sixty mute and category toggles and a burst of ten takeovers never create a second voice nor an orphan one.

- voicesBefore: 1
- voicesAfter: 1
- activeVoices: 1
- uiVoices: 1
- totalVoiceCap: 14
- cooldownSkips: 10
- buffers: 1
- maxBuffers: 8

### mission-state

The mission state is read from the real 116 tracker: one sound per real state, nothing for an unknown instance.

- instanceId: id-v1:16:mission-instance12:missions:14911:mission-1495:a0001
- cues: ui-tick,ui-tick
- repeatedStatus: DUPLICATE
- completedStatus: PLAYED
- completedVisual: Misiune completată · mission-149
- unknownStatus: UNKNOWN_MISSION
- unknownMissions: 1

### visual-equivalent

The indicator mirrors the last sound and the 079 infrastructure keeps the detailed publication row.

- visuals: 2
- indicatorKind: PUBLICATION
- indicatorText: Profil publicat · style:149:v5
- notificationStatus: ACCEPTED
- notificationRows: 1
- notificationKind: PUBLISHED
- notificationSymbol: ★

## Verificări

| Verificare | Așteptat | Obținut | Rezultat |
| --- | --- | --- | --- |
| gesture/status | AWAITING_GESTURE | AWAITING_GESTURE | PASS |
| gesture/no-voice | 0 | 0 | PASS |
| gesture/visual-shown | 1 | 1 | PASS |
| takeover/cue | takeover-notice | takeover-notice | PASS |
| takeover/one-voice | 1 | 1 | PASS |
| takeover/bus-duplicate | duplicate | duplicate | PASS |
| takeover/direct-duplicate | DUPLICATE | DUPLICATE | PASS |
| takeover/visual | true | true | PASS |
| publication/cue | profile-notice | profile-notice | PASS |
| publication/one-voice | 1 | 1 | PASS |
| publication/notification-duplicate | DUPLICATE | DUPLICATE | PASS |
| publication/visual | true | true | PASS |
| late/no-publication-for-candidate | 0 | 0 | PASS |
| late/analysis-cue | ui-tick | ui-tick | PASS |
| late/late-flag | true | true | PASS |
| late/own-outcome | profile-notice | profile-notice | PASS |
| toggle/no-extra-voice | 1 | 1 | PASS |
| toggle/within-total-cap | true | true | PASS |
| toggle/within-ui-cap | true | true | PASS |
| toggle/buffer-cap | true | true | PASS |
| toggle/cooldown-counted | true | true | PASS |
| mission/cues | ui-tick,ui-tick | ui-tick,ui-tick | PASS |
| mission/repeated | DUPLICATE | DUPLICATE | PASS |
| mission/completed | PLAYED | PLAYED | PASS |
| mission/visual | true | true | PASS |
| mission/unknown | UNKNOWN_MISSION | UNKNOWN_MISSION | PASS |
| visual/one-twin-per-sound | 2 | 2 | PASS |
| visual/indicator-kind | PUBLICATION | PUBLICATION | PASS |
| visual/indicator-text | true | true | PASS |
| visual/notification-accepted | ACCEPTED | ACCEPTED | PASS |
| visual/notification-kind | PUBLISHED | PUBLISHED | PASS |
| visual/notification-symbol | ★ | ★ | PASS |

Rezultat: 32/32 verificări, PASS.

## Contract

- version: 149-audio-feedback-v1
- emittedKeys: 256
- keyCodeUnits: 256
- idCodeUnits: 256
- textCodeUnits: 240
- retainedVisuals: 1

- TAKEOVER: takeover-notice <- 007 MANUAL_START
- PUBLICATION: profile-notice <- 007 PROFILE_ACTIVATE
- MISSION: ui-tick <- 116 mission instance
- LEARNING: ui-tick <- 079 notification
- echivalent vizual: Every accepted sound has a visual twin: the 149 indicator (one bounded status line) and, for the learning and the publication, the real 079 notification rows.

