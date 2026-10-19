# Bucla timpurie de învățare (PBI 204)

Adaptorul `composeEarlyLoopProfile` din `src/learning/early-loop.ts` este limitat explicit la `speed_delta_urban`, `desired_acceleration` și `stop_full_probability`. Primește modelele descriptive 093, candidații existenți 094/095/098 și sursele segment/oportunitate. O cheie fără evidence `READY`, candidat numeric eligibil sau proveniență rămâne neschimbată.

Blend-ul este `base + clamp(quality, 0, 1) × 0.25 × (candidate - base)`. Acest plafon conservator este local și provizoriu; nu schimbă 092, nu activează `estimable`, nu scrie surse `LEARNED` și nu publică versiuni persistente. MANUAL este no-op. Protocolul de admission 221 și schedulerul 219 rămân proprietarii propriilor contracte; adaptorul nu substituie aceste componente.

`compileEarlyLoopControllerProfiles(mode, baseProfile, earlyProfile)` adaptează valorile în memoria procesului în profilul canonic și trece rezultatul prin validatorii reali 046 (`compileCruiseProfile`), 047 (`compileLongitudinalProfile`) și 051 (`projectStopProfile`). Doar AUTO primește token-urile; MANUAL și LEARNING întorc `null`. Proveniența și dovezile profilului de bază sunt copiate, iar adaptorul nu setează `LEARNED`.

Acest adaptor nu oferă suportul complet de 24 chei. `tests/learning/early-loop.test.ts` demonstrează validarea profilului și valorile token-urilor; fixture-ul de mai jos măsoară efectul în 046/047/051 pe drumul 044, nu în jocul complet. Nicio valoare din acest document nu reprezintă rezultat de participant.

## Fixture comportamental executat (19 octombrie 2026)

`scripts/run-204-early-loop-behavior.mjs` rulează lanțul real pe harta 044: 093 ledger → 094/095/098 → `composeEarlyLoopProfile` → `compileEarlyLoopControllerProfiles` → 046/047/051, cu trei taxiuri și două civile. Profilele de bază sunt `speed_delta_urban=0`, `desired_acceleration=1.5`, `stop_full_probability=0.6`; candidații prudente/riscante sunt produși de estimatori din episoade, nu introduși manual. Rezultate executate:

| Set | 046 target (m/s) | 047 accelerație (m/s²) | 051 oprire completă | 051 rată |
| --- | ---: | ---: | --- | ---: |
| prudent | 9.75 | 1.35 | APPROACH / FULL | 29/40 (72.5%) |
| riscant | 10.5 | 2.0 | ROLL_THROUGH / ROLLING | 22/40 (55.0%) |
| fără dovezi | 10.0 | 1.5 | APPROACH / FULL | 26/40 (65.0%) |

Cele cinci vehicule primesc aceleași valori compilate; ținta 046 și accelerația 047 coincid în limita `1e-9`, iar 051 folosește același seed și aceeași oportunitate, deci rolul FULL/ROLLING este identic. Diferențele de clasă sedan/compact schimbă doar comanda de throttle, nu stilul. MANUAL întoarce `null` pentru profil și pentru token-uri, nu observă niciun episod și păstrează toate cele 80 de valori neschimbate (delta maxim 0). Fără dovezi, toate cele trei chei rămân la valoarea de bază (`candidate=null`, `blend=0`), iar AUTO reproduce numeric profilul de bază. Testele `tests/learning/early-loop-behavior.test.ts` (5/5) pică dacă evidence-ul este aplicat fără blend, dacă MANUAL se scurge, dacă o cheie nu are efect comportamental sau dacă o cheie neschimbată este modificată.

Probe-ul `scripts/run-204-loop-probe.mjs` hrănește direct API-urile 218/219/221 cu acest fixture, fără scripturile generice. Rezultatele sunt marcate `PROVISIONAL_UNCALIBRATED`: 218 (5 perechi, 120 cadre warmup + 600 măsurate) raportează frame/main-thread p95 median 0.7236 ms și p99 1.1839 ms; 219 raportează cost propriu p95 0.0064 ms, datorie p95 ≈1.2e-12 ms și 0 suprasarcini; 221 raportează coadă p95 7.618 ms, serviciu p95 1.4989 ms și end-to-end p95 8.5771 ms pentru opt joburi reale. Sunt valori Node CPU pe ceas sintetic 60 Hz, fără Rapier, browser, GPU sau FPS.

Playtest-ul rămâne neexecutat: zero participanți reali. Niciun număr din acest document nu este rezultat de participant și PBI-ul nu se închide pe baza fixture-ului.
