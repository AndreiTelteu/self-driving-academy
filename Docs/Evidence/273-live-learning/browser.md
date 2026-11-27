# 273 — proba de browser a pipeline-ului live de learning

Generată de `npm run learning:live:probe`; Chromium Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36, viewport 1280x720.

Flux real: start → panoul `Flotă` → preluare taxi → `L` LEARNING → condus pe ruta 041 →
`L` MANUAL → `M` AUTO. Proba citește segmentul 272, coada 103/221, versiunea 109, activarea 110 și
versiunea aplicată pe fiecare taxi și civil.

- `learning-segment-open`: PASS — active LEARNING eligible true
- `live-segment-sampled`: PASS — segment 271-live-three-modes:segment:1
- `learning-segment-closed`: PASS — closed LEARNING/MODE_CHANGE
- `eligible-learning-produced-job`: PASS — jobs 1, eligible 1
- `composed-immutable-version`: FAIL — versions 0, head profile-261-academy@1
- `activation-applied`: FAIL — activate null, applied null
- `city-style-changed`: FAIL — style null, fingerprint 1c4d32b2f4e3829a
- `whole-fleet-adopted`: FAIL — profile-261-academy@1, v3-composition-1 (58 vehicles)
- `xp-untouched`: FAIL — no XP writer is mounted by 273; the profile is the only publication

## Rezultat

- Segment LEARNING închis: 271-live-three-modes:segment:2
- Joburi / versiuni: 1 / 0
- Versiune publicată: `profile-261-academy@1`
- Activare: — la tick —, aplicată —
- Fingerprint profil: `1c4d32b2f4e3829a` → `1c4d32b2f4e3829a`
- Flotă: profile-261-academy@1, v3-composition-1

## Limitări

- Drum local scurt, nu un playtest complet și nu o măsurare FPS/GPU/hardware.
- Browserul folosește runtime-ul 103/221 în proces când nu este disponibil un port Worker dedicat;
  probe-ul Node măsoară `WorkerRuntime` real.
