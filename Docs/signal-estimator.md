# Estimator semafor — PBI 097

`estimateSignalParameters` consumă read model-ul 093, denominatorul cumulativ 086, fapte de eligibilitate 087, ferestre 088 și timing-uri reale. Rezultă candidați imuabili doar pentru `red_stop_probability`, `green_start_delay`, `red_stop_line_offset` și `late_red_brake_threshold`; fără profil, delta sau activare.

Probabilitatea RED folosește oportunitățile RED certe eligibile raportate de 086 ca denominator; `TRUNCATED` rămâne `incomplete` și este expus separat, fără succes/eșec. ID-ul oportunității plus occurrence deduplică toate cadrele repetate. Când denominatorul cert este zero, statusul este `REFUSED`, valoarea `null`, motivul `ZERO_CERTAIN_RED_DENOMINATOR`.

Întârzierea GREEN este diferența în tick-uri dintre onset și plecare, convertită cu 60 tick/s, numai pentru plecări neblocate. Plecările blocate de lider se numără în `blockedGreenDepartures` și nu intră în medie. Offsetul liniei și pragul de frânare folosesc fapte RED eligibile agregate pe oportunitate, niciodată cadre ori distanța parcursă.

## Limitări

Apelantul furnizează denominatorul cumulativ și faptele temporale autoritative; estimatorul verifică identitățile încrucișate, dar nu reconstruiește evenimente lipsă. Media aritmetică nu este robustă la outlieri, iar 60 tick/s reflectă pasul fix curent. Nu există wiring în worker/profil, calibrare live sau verificare gameplay.
