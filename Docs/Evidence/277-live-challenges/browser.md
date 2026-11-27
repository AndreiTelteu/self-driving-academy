# 277 — proba de browser a provocărilor live

Generată de `npm run challenges:live:probe`; Chromium 157.0.8103.51, backend WEBGL2,
viewport 1024x640, tick 20–17.

Secvența reală: start → tutorial sărit → taxi real preluat → ofertă de precizie (checkpointuri)
cerută prin host → Acceptă din panoul nativ → condus pe traseul 041 prin checkpointurile 032 →
verdict 231 → credit 213 o singură dată → record 233 → „Mai încearcă” dezactivat → cerere de
demolare refuzată înainte de afișare → reload cu același record și același XP.

- Taxi: `id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0023`; ofertă: `id-v1:18:challenge-instance26:231-challenge-templates-v17:ACADEMY33:challenge-influencer-single-frame1:13:3001:1` (`challenge-influencer-single-frame`), zonă
  `sz:0-3`, seed 300.
- Acceptare: ACTIVE; deadline 12680; finalizare la tick 10284.
- Rezultat: COMPLETED; XP 92.8577; intrări ledger 20;
  intrări de recompensă provocare 1 (90 XP);
  comparație FIRST_RECORD; recorduri 1; cooldown rămas 10583.
- Amprente: XP `fnv1a32:8ebb3168` → `fnv1a32:e5c1a8b8`; profil
  `profile-261-academy@1` / `null`,
  neschimbat true.
- Panou: acțiuni ofertă ACCEPT, DECLINE, CONTINUE; acțiuni rezultat
  RETRY, CONTINUE; XP afișat „90 XP creditați”; recorduri 1.
- Reluare: `NOT_FAILED`; ledger după reluare 20 (fără dublare).
- Demolare: NO_ELIGIBLE_TEMPLATE — SESSION:ACADEMY, CAPABILITY:DESTRUCTIBLE_DECOR.
- Reload: restaurat true; XP 92.932883; intrări 22;
  recorduri 1.

Capturi: [screenshots/01-offer.png](screenshots/01-offer.png), [screenshots/02-active.png](screenshots/02-active.png), [screenshots/03-result.png](screenshots/03-result.png), [screenshots/04-reload.png](screenshots/04-reload.png).

- `destruction-refused-before-display`: PASS — NO_ELIGIBLE_TEMPLATE — SESSION:ACADEMY, CAPABILITY:DESTRUCTIBLE_DECOR; unavailable SESSION:ACADEMY, CAPABILITY:DESTRUCTIBLE_DECOR, FACT_SOURCE_UNAVAILABLE:DISTRUCTION
- `offer-visible-through-host`: PASS — offer id-v1:18:challenge-instance26:231-challenge-templates-v17:ACADEMY33:challenge-influencer-single-frame1:13:3001:1, refusal none: 
- `panel-shows-offer`: PASS — CHECKPOINTS · 2
- `active-deadline-and-zone`: PASS — zone sz:0-3, target 2, route 36 points, remaining 12600
- `drive-to-zone`: PASS — stopped inside sz:0-3
- `precision-challenge-completed`: PASS — COMPLETED 2/2, xp 92.8577, challenge entries 1
- `first-record-and-cooldown`: PASS — FIRST_RECORD, cooldown 10583
- `profile-no-writes`: PASS — head profile-261-academy@1, profile none
- `retry-refused-after-success`: PASS — NOT_FAILED, challenge entries 1
- `panel-shows-result-record-actions`: PASS — 90 XP creditați, records 1
- `reload-keeps-record-and-reward`: PASS — restored true, records 1, challenge entries 1, reward 90 XP

Limite: proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman și nu măsoară FPS/GPU. Persistarea probei este sessionStorage; fișierul durabil rămâne
278. Demolarea nu este simulată: refuzul este dovada că 285 nu este montat.
