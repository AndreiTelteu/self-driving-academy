# Profiluri și propagare în flotă

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Versiuni și aplicarea în flotă

Versiunea codului motorului, versiunea schemei de parametri și versiunea profilului sunt separate. Un profil nou poate schimba stilul fără să schimbe algoritmul motorului. Orice schimbare de cod sau de schemă este explicită și însoțită de reguli de compatibilitate.

Un profil conține profileId, versionId, parentVersionId, schemaVersion, engineVersion, parameters, evidenceByParameter, sourceSegmentIds, createdAt și checksum. Un ProfileDelta conține baseVersionId, chei schimbate, valori anterioare și noi, motive și dovezi. Indicatorii derivați precum agresivitatea sunt calculați din parametri, cu formula versionată separat.

Segmentele LEARNING închise și eligibile intră într-o coadă serială. Fiecare estimare folosește ultima versiune acceptată când începe. Un rezultat care se referă la o bază depășită este recalculat sau recompus în mod explicit; nu suprascrie schimbările altei intervenții. ID-ul segmentului asigură că același segment nu este aplicat de două ori.

Publicarea creează o versiune imuabilă și o comandă PROFILE_ACTIVATE pentru un tick viitor comun. La acel tick toate taxiurile și mașinile civile adoptă aceeași referință, inclusiv vehiculele selectate sau nevizibile. Vehiculele create ulterior citesc versiunea activă a orașului. Un vehicul în MANUAL sau LEARNING înregistrează referința, dar comenzile jucătorului au prioritate până la revenirea în AUTO.

Noile ținte sunt folosite la următoarea decizie relevantă. Manevrele deja angajate au o continuitate fizică: schimbarea profilului nu teleportă, nu resetează viteza și nu reeșantionează o oportunitate de roșu deja evaluată. O schimbare de bandă în curs se finalizează sau se abandonează prin regulile controllerului. Astfel adoptarea versiunii este simultană, iar efectele apar în contexte diferite.

Toate taxiurile și civilele au același profil de stil; rutele și clasele lor diferă. Nu există personalități suplimentare ascunse care să dilueze această cerință. Eșantionările probabilistice au seed-uri pe vehicul și oportunitate, astfel încât un profil probabilistic produce aceeași tendință fără ca toate vehiculele să efectueze simultan aceeași acțiune.

Restaurarea unei versiuni anterioare publică o activare nouă cu proveniență explicită. Versiunile existente nu sunt editate. Un profil importat este validat și devine activ prin același mecanism. Scorul XP aparține PlayerProgress și nu este importat sau resetat printr-un simplu export/import de DrivingProfile.

## Barieră la restaurare, import și profil nou

learningEpoch este o generație monotonă a țintei de învățare, distinctă de versionId. Fiecare segment și job păstrează playerId, profileId, learningEpoch, segmentId și baseVersionId. Actualizările succesive din aceeași generație pot fi recompuse serial; rezultatele dintr-o altă generație nu pot fi recompuse peste profilul curent.

Restore, import validat și profil nou se rezolvă la limita unui tick: se închide segmentul existent cu motiv explicit, se invalidează joburile și activările nepublicate din generația veche, se incrementează learningEpoch și se activează ținta. Dovezile vechi rămân în istoric cu statut CANCELLED_BY_PROFILE_CHANGE. Un segment LEARNING reluat are o nouă identitate și noua generație. Importul invalid nu produce barieră și nu anulează joburile curente. Rezultatele întârziate ale joburilor invalidate sunt ignorate și explicate în UI.

Se testează restore cu worker în curs, import invalid/valid, profil nou, rezultat sosit după anulare, aceeași intervenție livrată de două ori și un crash în jurul commitului. Bariera și activarea sunt persistate împreună; reluarea nu aplică din nou segmente deja acceptate.
