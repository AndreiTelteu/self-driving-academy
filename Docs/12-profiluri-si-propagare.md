# Profiluri și propagare în flotă

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Versiuni și aplicarea în flotă

Versiunea codului motorului, versiunea schemei de parametri și versiunea profilului sunt separate. Un profil nou poate schimba stilul fără să schimbe algoritmul motorului. Orice schimbare de cod sau de schemă este explicită și însoțită de reguli de compatibilitate.

Un profil conține profileId, versionId, parentVersionId, schemaVersion, engineVersion, parameters, evidenceByParameter, sourceSegmentIds, createdAt și checksum. Un ProfileDelta conține baseVersionId, chei schimbate, valori anterioare și noi, motive și dovezi. Indicatorii derivați precum agresivitatea sunt calculați din parametri, cu formula versionată separat.

Segmentele LEARNING închise și eligibile intră într-o coadă serială. Fiecare estimare folosește ultima versiune acceptată când începe. Un rezultat care se referă la o bază depășită este recalculat sau recompus în mod explicit; nu suprascrie schimbările altei intervenții. ID-ul segmentului asigură că același segment nu este aplicat de două ori.

Implementarea de versionare din [profile-store](profile-store.md) păstrează aceste reguli în memorie: fiecare versiune este înghețată la adâncime și conține versionId, parentVersionId explicit, engineVersion, valorile complete și proveniența (segmente, intervenții, delta validat cu baza și valorile anterioare). O versiune nu este editată în loc, iar un delta nu poate înlocui tacit baza. Resubmisia aceluiași segment întoarce versiunea existentă, nu creează una nouă; părintele inexistent, străin sau propriu, engine-ul incompatibil și delta invalid sunt respinse cu motive închise. Istoricul are limite explicite pe profil și global, cu `clear`/`dispose` și contoare. Store-ul nu publică, nu activează și nu marchează LEARNED; publicarea și propagarea la tick rămân în PBI 110.

Publicarea creează o versiune imuabilă și o comandă PROFILE_ACTIVATE pentru un tick viitor comun. La acel tick toate taxiurile și mașinile civile adoptă aceeași referință, inclusiv vehiculele selectate sau nevizibile. Vehiculele create ulterior citesc versiunea activă a orașului. Un vehicul în MANUAL sau LEARNING înregistrează referința, dar comenzile jucătorului au prioritate până la revenirea în AUTO. Contractul concret de activare, cu plan validat integral, rollback și motive închise, este în [profile-activation](profile-activation.md).

Noile ținte sunt folosite la următoarea decizie relevantă. Manevrele deja angajate au o continuitate fizică: schimbarea profilului nu teleportă, nu resetează viteza și nu reeșantionează o oportunitate de roșu deja evaluată. O schimbare de bandă în curs se finalizează sau se abandonează prin regulile controllerului. Astfel adoptarea versiunii este simultană, iar efectele apar în contexte diferite. Contractul care verifică aceste reguli, cu snapshot-ul manevrei, memo-ul de decizii și violările închise, este în [profile-continuity](profile-continuity.md).

Toate taxiurile și civilele au același profil de stil; rutele și clasele lor diferă. Nu există personalități suplimentare ascunse care să dilueze această cerință. Eșantionările probabilistice au seed-uri pe vehicul și oportunitate, astfel încât un profil probabilistic produce aceeași tendință fără ca toate vehiculele să efectueze simultan aceeași acțiune.

Integrarea dintre segment, estimator și publicare este explicită în [profile-pipeline](profile-pipeline.md): segmentul `LEARNING` eligibil intră în coada 103, compoziția acceptată de 102 devine o singură versiune 109 cu părintele head-ului, iar versiunea este publicată în 110 la tick-ul următor. `MANUAL`/`AUTO` și `LEARNING` neeligibil nu produc job sau versiune, o compoziție fără schimbare reală este `NO_CHANGE`, un rezultat depășit în aceeași generație este `RECOMPOSED` explicit, iar o bază sau o epocă străină rămâne `STALE_JOB`. Re-submisia aceluiași segment întoarce versiunea existentă, nu creează una nouă.

Restaurarea unei versiuni anterioare publică o activare nouă cu proveniență explicită. Versiunile existente nu sunt editate. Un profil importat este validat și devine activ prin același mecanism. Scorul XP aparține PlayerProgress și nu este importat sau resetat printr-un simplu export/import de DrivingProfile.

## Barieră la restaurare, import și profil nou

learningEpoch este o generație monotonă a țintei de învățare, distinctă de versionId. Fiecare segment și job păstrează playerId, profileId, learningEpoch, segmentId și baseVersionId. Actualizările succesive din aceeași generație pot fi recompuse serial; rezultatele dintr-o altă generație nu pot fi recompuse peste profilul curent.

Restore, import validat și profil nou se rezolvă la limita unui tick: se închide segmentul existent cu motiv explicit, se invalidează joburile și activările nepublicate din generația veche, se incrementează learningEpoch și se activează ținta. Dovezile vechi rămân în istoric cu statut CANCELLED_BY_PROFILE_CHANGE. Un segment LEARNING reluat are o nouă identitate și noua generație. Importul invalid nu produce barieră și nu anulează joburile curente. Rezultatele întârziate ale joburilor invalidate sunt ignorate și explicate în UI.

Se testează restore cu worker în curs, import invalid/valid, profil nou, rezultat sosit după anulare, aceeași intervenție livrată de două ori și un crash în jurul commitului. Bariera și activarea sunt persistate împreună; reluarea nu aplică din nou segmente deja acceptate.

## MANUAL_TUNING și izolarea lumilor

DrivingProfile/ProfileDelta includ proveniența valorii (LEARNED/MANUAL_TUNING/BASE/IMPORTED), iar dovezile anterioare rămân istorice. Aplicarea sliderelor validează draft/baseVersionId, închide segmentul, invalidează learningEpoch și publică o versiune nouă la tick comun; anularea sau lipsa diferențelor nu creează versiuni. Contractul este în [modulul 27](27-reglaje-hud-si-camera.md). Academie și Haos au profile țintă distincte; joburile și activările verifică sessionId/worldEpoch. Copierea explicită a stilului între sesiuni folosește validarea/importul comun, fără transfer XP, conform [modulului 26](26-joaca-libera-haos-si-distrugere.md).
