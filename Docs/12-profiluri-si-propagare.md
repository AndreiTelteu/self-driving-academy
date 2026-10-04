# Profiluri și propagare în flotă

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Versiuni și aplicarea în flotă

Versiunea codului motorului, versiunea schemei de parametri și versiunea profilului sunt separate. Un profil nou poate schimba stilul fără să schimbe algoritmul motorului. Orice schimbare de cod sau de schemă este explicită și însoțită de reguli de compatibilitate.

Un profil conține profileId, versionId, parentVersionId, schemaVersion, engineVersion, parameters, evidenceByParameter, sourceSegmentIds, createdAt și checksum. Un ProfileDelta conține baseVersionId, chei schimbate, valori anterioare și noi, motive și dovezi. Indicatorii derivați precum agresivitatea sunt calculați din parametri, cu formula versionată separat.

Intervențiile închise intră într-o coadă serială. Fiecare estimare folosește ultima versiune acceptată când începe. Un rezultat care se referă la o bază depășită este recalculat sau recompus în mod explicit; nu suprascrie schimbările altei intervenții. ID-ul segmentului asigură că același segment nu este aplicat de două ori.

Publicarea creează o versiune imuabilă și o comandă PROFILE_ACTIVATE pentru un tick viitor comun. La acel tick toate taxiurile adoptă aceeași referință de profil, inclusiv taxiul selectat. Un taxi aflat în manual înregistrează referința, dar comenzile manuale au prioritate până la revenirea în AUTO.

Noile ținte sunt folosite la următoarea decizie relevantă. Manevrele deja angajate au o continuitate fizică: schimbarea profilului nu teleportă, nu resetează viteza și nu reeșantionează o oportunitate de roșu deja evaluată. O schimbare de bandă în curs se finalizează sau se abandonează prin regulile controllerului. Astfel adoptarea versiunii este simultană, iar efectele apar în contexte diferite.

Toate taxiurile au același profil de stil. Nu există personalități suplimentare ascunse care să dilueze această cerință. Eșantionările probabilistice au seed-uri pe vehicul și oportunitate, astfel încât un profil probabilistic produce aceeași tendință fără ca toate vehiculele să efectueze simultan aceeași acțiune.

Restaurarea unei versiuni anterioare publică o activare nouă cu proveniență explicită. Versiunile existente nu sunt editate. Un profil importat este validat și devine activ prin același mecanism.
