# Estimator de urmărire — PBI 096

`estimateFollowingParameters` consumă read model-ul descriptiv 093 și fapte 086/087/088 de urmărire. Produce numai candidați imuabili pentru `following_time_headway`, `following_min_gap`, `queue_standstill_gap` și `following_speed_gain`; nu scrie în profil și nu schimbă starea ledger-ului.

Pentru episoade LEADER în mișcare, relația ajustată este `gapM = following_min_gap + following_time_headway × speedMps`, prin cele mai mici pătrate. Raportul include RMS-ul reziduurilor în metri. Panta și interceptul sunt publicate împreună numai când sunt viteze distincte și fit-ul are coeficienți fizici nenegativi. La o singură viteză ambii rămân `UNIDENTIFIED` cu `WEAK_IDENTIFICATION_SPEED_VARIATION_REQUIRED`; nu există pereche fabricată. Pragurile minime de episoade rămân cele din `parameterEvidenceSpecs` 093.

Faptele sunt deduplicate după opportunity ID, occurrence și leader ID. O schimbare de lider creează un episode distinct și incrementă `leaderChangeSplits`; faptele de coadă folosesc separat `QUEUE_STANDSTILL` numai cu ego și lider sub 0.1 m/s. LEADER extern și prefix 088 sunt obligatorii. Speed gain necesită `speedGain` observat separat și nu este dedus din coeficienții gap/headway.

## Limitări

Estimatorul este un fit OLS determinist, sensibil la outlieri; RMS-ul îl face inspectabil, dar nu este interval de încredere. Datele sursă trebuie să furnizeze `speedGain` semnificativ și identitate de lider corectă. Integrarea în worker/profil, calibrare live și gameplay nu sunt incluse.
