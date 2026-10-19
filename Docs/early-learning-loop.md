# Bucla timpurie de învățare (PBI 204)

Adaptorul `composeEarlyLoopProfile` din `src/learning/early-loop.ts` este limitat explicit la `speed_delta_urban`, `desired_acceleration` și `stop_full_probability`. Primește modelele descriptive 093, candidații existenți 094/095/098 și sursele segment/oportunitate. O cheie fără evidence `READY`, candidat numeric eligibil sau proveniență rămâne neschimbată.

Blend-ul este `base + clamp(quality, 0, 1) × 0.25 × (candidate - base)`. Acest plafon conservator este local și provizoriu; nu schimbă 092, nu activează `estimable`, nu scrie surse `LEARNED` și nu publică versiuni persistente. MANUAL este no-op. Protocolul de admission 221 și schedulerul 219 rămân proprietarii propriilor contracte; adaptorul nu substituie aceste componente.

`compileEarlyLoopControllerProfiles(mode, baseProfile, earlyProfile)` adaptează valorile în memoria procesului în profilul canonic și trece rezultatul prin validatorii reali 046 (`compileCruiseProfile`), 047 (`compileLongitudinalProfile`) și 051 (`projectStopProfile`). Doar AUTO primește token-urile; MANUAL și LEARNING întorc `null`. Proveniența și dovezile profilului de bază sunt copiate, iar adaptorul nu setează `LEARNED`.

Acest adaptor nu oferă suportul complet de 24 chei. Testul curent demonstrează validarea profilului și valorile token-urilor, nu efectul măsurat în condus. Fixture-ul comportamental cu 3 taxiuri și 2 civile, datele independente prudent/riscant/fără dovezi și măsurătoarea integrată 218/219/221 rămân de executat înainte de închiderea PBI. Nicio valoare din acest document nu reprezintă rezultat de participant.
