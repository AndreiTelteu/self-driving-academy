# 276 — proba de browser pentru daily, XP și nivel

Generată de `npm run progress:daily:probe`; Chromium Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36, backend WEBGL2,
viewport 1024x640, tick 15–9499.

Secvența reală: start → tutorial sărit explicit → trei misiuni zilnice citite din generatorul 211 →
preluare taxi 265 → condus manual până la pickup/dropoff 032 → obiectiv zilnic `COMPLETED` →
ledgerul 213 afișează soldul, nivelul și istoricul → „Oraș proaspăt” real → aceeași zi și același XP →
reload → același set și aceeași recompensă, fără dublare.

- Zi: `2026-11-27`; obiective: FULL_STOPS, MANUAL_DROPOFFS, CLEAN_DROPOFFS; MANUAL fără learning: 3.
- Cursă: `id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0001`; taxi `id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0006`; pickup `sz:3-2` → dropoff
  `sz:2-3`; boarding 6502, completion 9457.
- Înainte de cursă: 0 XP, 0 obiective.
- După cursă: 302.524383 XP, nivel 3, 2 obiective; intrări
  19; recompense zilnice 2.
- Panou: `data-xp-balance="302.524383 XP"`, `data-level="3"`,
  `data-completed="2"`; istoric 12 rânduri.
- Reset real: XP 302.641383 → 302.641383; amprenta
  `fnv1a32:e61cce9a` → `fnv1a32:e61cce9a`; recompense
  2.
- Reload: XP 302.641383; același set da; restore
  da; duplicate 0.

Capturi: [screenshots/01-daily.png](screenshots/01-daily.png), [screenshots/02-onboard.png](screenshots/02-onboard.png), [screenshots/03-daily-complete.png](screenshots/03-daily-complete.png), [screenshots/04-progress-panel.png](screenshots/04-progress-panel.png), [screenshots/04b-daily-panel.png](screenshots/04b-daily-panel.png), [screenshots/05-after-reset.png](screenshots/05-after-reset.png), [screenshots/06-after-reload.png](screenshots/06-after-reload.png).

- `progress-port`: PASS — port PRESENT
- `daily-three`: PASS — 3 objectives
- `daily-manual-without-learning`: PASS — 3 MANUAL objectives
- `daily-promised-xp`: PASS — 300 promised XP
- `daily-window`: PASS — 2026-11-27 Europe/Bucharest
- `xp-initial-zero`: PASS — 0 XP
- `xp-no-debits`: PASS — zero debits/profile writes
- `manual-mode`: PASS — the takeover starts a real MANUAL segment
- `ride-completed`: PASS — state COMPLETED
- `manual-or-mixed-mode`: PASS — manual drive completed
- `daily-completed`: PASS — 2 daily objectives completed
- `daily-reward-credited`: PASS — 2 daily XP entries
- `xp-updated`: PASS — 302.524383 XP
- `level-derived`: PASS — level 3
- `balance-sum`: PASS — balance is the sum of entries
- `daily-reward-once`: PASS — 2 rewards / 2 entries
- `panel-xp`: PASS — 302.524383 XP (ledger 302.524383 XP)
- `panel-level`: PASS — 3
- `panel-completed`: PASS — 2
- `panel-history`: PASS — 12
- `panel-objectives`: PASS — 3
- `panel-window`: PASS — window and reset are visible
- `panel-no-xp-loss`: PASS — no XP loss message
- `paused-xp-stable`: PASS — 302.6358 -> 302.641383 XP while paused
- `reset-preserves-xp`: PASS — 302.641383 -> 302.641383
- `reset-preserves-fingerprint`: PASS — fnv1a32:e61cce9a -> fnv1a32:e61cce9a
- `reset-preserves-rewards`: PASS — 2 rewards
- `reload-restored`: PASS — restore {"restored":true,"reason":"REBOUND"}
- `reload-same-set`: PASS — the same three instance ids
- `reload-same-xp`: PASS — 302.641383 -> 302.641383
- `reload-no-duplicate-entries`: PASS — 21 -> 21
- `reload-storage`: PASS — storage SESSION_STORAGE

Limite: proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman și nu măsoară FPS/GPU. Persistarea durabilă în fișier rămâne 278; checkpointul probei
este sessionStorage, nu un savefile.
