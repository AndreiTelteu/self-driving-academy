# Salvare și import export

Versiune 0.10 · 22 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Date salvate și export

IndexedDB stochează metadate de sesiune, profiluri și delte, dovezi agregate, segmente manuale, progresul misiunilor, scenarii și setări. Salvarea periodică propusă este la 15 secunde și la închiderea intervenției, publicare de profil și final de misiune. Intervalul va fi calibrat după volum.

Un export de profil JSON include schema, versiuni, parametri, dovezi agregate și proveniență minimă. Nu include automat toată telemetria. Un export de sesiune separat poate include segmente și scenarii, cu descrierea dimensiunii.

Importul validează schema, cheile permise, unitățile, numerele finite, intervalele, versiunea motorului și mărimea fișierului. Datele sunt tratate ca date, fără evaluare de cod. Cheile necunoscute rămân inactive sau sunt respinse cu explicație; un profil incompatibil nu devine activ parțial.

Scrierea profilului și a activării se face tranzacțional. Un crash nu lasă un profil activ care nu poate fi încărcat. La depășirea cotei locale, aplicația oferă export și eliminarea replay-urilor vechi; nu șterge automat profilul curent sau progresul. Păstrarea propusă a telemetriei brute este o fereastră recentă de 30 de minute de condus manual, cu posibilitatea de a fixa segmente; dovezile agregate se păstrează separat.

Salvarea locală depinde de datele browserului. Ștergerea acestora sau folosirea altui browser nu transferă automat progresul. Exportul este mecanismul de transfer și backup din prima versiune.

## Tranzacții și migrare

Repository-ul local validează înainte de commit și păstrează o referință activă existentă dacă importul eșuează. Exportul de profil și exportul de sesiune sunt operații diferite. Migrarea schemei păstrează proveniența și marchează dovezile incompatibile fără a transforma lipsa lor în zero.

UI arată pending, succes sau eroare după rezultatul real al scrierii. Posibilitatea de export rămâne accesibilă când rendererul nu poate porni. V3 extinde starea salvată cu personaj și entitate controlată, fără a crea autorități duplicate la reload.

## Checkpointul lumii și continuarea sesiunii

SessionCheckpoint este distinct de salvarea progresului și conține checkpointId, tick, versiuni ale engine-ului/fizicii/hărții, snapshot fizic, entityId↔handle, clase și stări ale vehiculelor, rute, stări și memorie de controller/FSM, oportunități deja evaluate, semafoare, cerere, dispecer, curse/pasageri, generatorii RNG, deduplicarea evenimentelor, profil/activări și learningEpoch. Snapshotul Rapier nu înlocuiește stările proprii ale jocului. Seria de contracte include și timpul economic, ledgerul comercial, review-urile, misiunile zilei și ledgerul XP din modulele 22–23.

Checkpointul lumii, referințele de profil și ledger-ele sunt comise într-o generație coerentă; scrierile incomplete nu sunt activate. Un restart valid păstrează pozițiile, cursele, pasagerii, KPI-urile și progresul la ultimul checkpoint confirmat. UI afișează vârsta acestuia. Sesiunea se deschide în pauză, tastele sunt eliberate, vehiculele devin AUTO; segmentul anterior este INCOMPLETE și numai observațiile LEARNING finalizate pot fi reluate idempotent. Preluarea de către jucător deschide un segment nou. O versiune incompatibilă permite export și un nou scenariu cu progres păstrat, fără promisiunea continuării lumii vechi.

Joburile neacceptate sunt persistate ca descrieri reluabile, nu ca thread-uri active. La reload se verifică profileId și learningEpoch înainte de relansare. Rezultatele deja acceptate nu se repetă. Pierderea GPU în aceeași pagină folosește starea în RAM; integrarea recuperării cu salvarea durabilă se verifică după PBI 206, fără dependență timpurie a rendererului de tot subsistemul DB.

## Autoritatea salvării între taburi

O singură pagină are drept de scriere pentru playerId/sessionId. A doua pagină este read-only sau oferă transfer explicit de sesiune; nu pornește un al doilea autosave concurent. Protocolul tratează page close, tab suspendat și DB upgrade blocat. Transferul și importul de sesiune nu dublează reward-urile sau XP. Profilele de driving exportate separat nu conțin progresul jucătorului. Retenția replay-ului poate șterge chunkuri vechi, dar nu checkpointul activ, ledgerul comercial sau dovezile XP necesare deduplicării.

## Buget de captură și commit

Snapshotul Rapier și copierea coerentă a stării au un cost sincron măsurat. Asincronia IndexedDB nu elimină acest cost. 222 pregătește/encodează datele incremental sau în worker, cu maximum o generație în pregătire și una în commit; cererile periodice redundante sunt coalesced, păstrând evenimentele comerciale/reward și invalidările. Tranzacția care publică checkpointul nu așteaptă mesaje de worker. Shutdownul nu garantează un ultim commit. Vârsta salvării și datele nesalvate sunt explicite; limitele și probele cu storage lent sunt în [modulul 25](25-performanta-contracte-si-benchmark.md).

## Savefile complet și noile stări V1

[Modulul 29](29-savefile-si-integritate.md) definește fișierul .sdasave cu SHA-256 inclus, canonicalizare versionată, verificare înainte de migrare și încărcare atomică fără ignorarea checksumului. Autosave/export de profil/savefile sunt acțiuni distincte. Checkpointul include Academie/Haos, worldEpoch, destructibile, provocări/recorduri și ControlPreferences. Profilurile păstrează proveniența MANUAL_TUNING. XP conține numai credite nenegative; nu persistă evaluări de penalizare. Importul complet înlocuiește progresul după verificare și confirmare, fără adunarea recompenselor.

## Contract implementat V1 (PBI 127) — schema IndexedDB și repository local

Modulul `src/persistence` este implementat ca o familie de porturi (`DatabasePort`, `FactoryPort`, `TransactionPort`, `LockManagerPort`) cu două adaptoare: `indexeddb.ts` pentru IndexedDB-ul real și `memory-idb.ts`, un dublu în memorie folosit de testele deterministe din Node. Driverul real este izolat de port, deci comportamentul nu este simulat în testele de corectitudine.

**Baza de date și store-uri.** Nume stabil al bazei: `self-driving-academy`; formatul de date: `self-driving-academy-local`; versiunea de schemă curentă: `2`. Store-urile declarate și cheile lor primare:

| Store | Cheie primară | Indexuri |
| --- | --- | --- |
| `meta` | `key` | — (marcajul de format și de versiune) |
| `profiles` | `versionId` | `byProfile` → `profileId` |
| `profileActivations` | `profileId` | — |
| `segments` | `recordId` | `bySession` → `sessionId`, `byStatus` → `status` |
| `scenarios` | `recordId` | `bySession` → `sessionId` |
| `progress` | `recordId` | `bySession` → `sessionId`, `byStatus` → `status` |
| `settings` | `playerId` | — |
| `checkpoints` | `checkpointId` | `bySession` → `sessionId`, `byGeneration` → `generation` |

**Migrare explicită.** Istoricul este declarat, nu calculat: pasul `127-v1-base-layout` (versiunea 1) creează `meta`, `profiles`, `profileActivations`, `segments`, `scenarios`, `progress` și `settings`; pasul `127-v2-checkpoints-and-lifecycle-indexes` (versiunea 2) creează `checkpoints` și adaugă indexurile `segments.byStatus` și `progress.byStatus` fără a rescrie rânduri. `planUpgrade` este continuu (fără goluri) și refuză explicit o bază de date mai nouă decât build-ul curent cu `SCHEMA_TOO_NEW`; migrarea se aplică întotdeauna în interiorul tranzacției de upgrade, iar o migrare eșuată lasă versiunea și rândurile anterioare intacte (`MIGRATION_FAILED`).

**Stări explicite, nu excepții mută.** Repository-ul expune stările `CLOSED`, `OPENING`, `READY`, `BLOCKED_UPGRADE`, `RELEASED_FOR_UPGRADE`, `FAILED` și `DISPOSED`, împreună cu rolul `NONE`/`WRITER`/`READ_ONLY`/`WAITING`/`RELEASED` și un cod de cauză închis. Un upgrade blocat de o altă conexiune deschisă produce `BLOCKED_UPGRADE` cu `UPGRADE_BLOCKED` și poate fi reluat cu `retryBlockedUpgrade()` după ce tabul blocant se închide; o eroare de deschidere produce `FAILED` cu `OPEN_FAILED` (sau `OPEN_TIMEOUT`); o bază de date prea nouă produce `SCHEMA_TOO_NEW`. Când alt tab cere o versiune mai nouă, pagina curentă trece în `RELEASED_FOR_UPGRADE` cu `VERSION_CHANGE`, eliberează blocajul de scriere și închide conexiunea.

**Un singur scriitor.** Dreptul de scriere este un lock exclusiv Web Locks (`self-driving-academy-persistence-writer`). `claim()` este non-blocant: dacă lock-ul este ocupat, pagina devine `READ_ONLY` cu `WRITER_HELD_BY_OTHER_TAB` și orice scriere este respinsă cu `WRITER_REQUIRED` — nu există fallback nesigur. `wait()` intră în coadă (`WAITING`) și primește rolul de `WRITER` când deținătorul eliberează lock-ul; acesta este transferul explicit de scriitor. Fără Web Locks pagina rămâne `READ_ONLY` cu `WEB_LOCKS_UNAVAILABLE`. Paginile cititoare citesc datele scriitorului, dar nu scriu.

**Coerență și limite.** Fiecare înregistrare este validată și măsurată înainte să ajungă într-o tranzacție: corpul trebuie să fie JSON simplu, adâncime cel mult 24, cel mult 20 000 de intrări, cel mult 262 144 de octeți pentru corp și cel mult 1 048 576 de octeți pentru înregistrarea completă; o listă returnează cel mult 512 rânduri, altfel `LIST_LIMIT`. Scrierile multi-store (de exemplu activarea unui profil împreună cu versiunea profilului) sunt tranzacționale: o eroare la mijloc lasă baza exact cum era, fără activare orfană. Versiunile de profil 109 sunt imutabile (`IMMUTABLE_RECORD`) și checksum-ul lor este re-verificat la citire (`PROFILE_CHECKSUM_MISMATCH`); o revizie mai veche nu înlocuiește una mai nouă (`STALE_REVISION`).

## Contract implementat V1 (PBI 128) — tranzacția profil/activare

`src/persistence/profile-transaction.ts` (contract `128-profile-transaction-v1`) scrie versiunea 109 și activarea 110 într-o singură tranzacție multi-store peste `profiles` și `profileActivations`. Repository-ul (`commitProfileActivation`) deține conexiunea, lock-ul de scriere și limita tranzacției; modulul de tranzacție deține regulile și lucrează pe `TransactionPort`, deci aceleași reguli rulează peste adaptorul IndexedDB real și peste dublul în memorie.

**Reguli, toate verificate înainte de commit.** Activarea trebuie să indice exact versiunea scrisă de aceeași tranzacție, altfel `REFERENCE_MISSING`: nu există activare fără versiunea ei și nu există versiune fără activarea corectă. Părintele unei versiuni derivate trebuie să fie deja stocat, altfel `REFERENCE_MISSING`: istoricul nu are găuri. O versiune stocată este imuabilă (`IMMUTABLE_RECORD`), iar secvența activării nu se întoarce niciodată: o secvență mai veche nu poate înlocui o versiune mai nouă activă (`STALE_REVISION`), iar aceeași secvență nu poate indica altă versiune (`STALE_REVISION`). Repetarea exactă a aceleiași tranzacții este idempotentă: nu se creează a doua versiune și pointerul nu se mută.

**Crash înainte și după commit.** Tranzacția expune două puncte de injecție de defecțiune folosite de testele deterministe: `beforeCommit` rulează în interiorul tranzacției, după toate scrierile, deci o excepție acolo anulează tranzacția și baza rămâne exact cum era; `afterCommit` rulează după commit, deci o excepție acolo modelează un proces mort după ce datele au devenit durabile. Rezultatul este explicit, nu o excepție: `COMMITTED`, `CRASHED_AFTER_COMMIT` (rândurile sunt durable) sau `REJECTED` cu codul închis. Testele verifică ambele întreruperi: înainte de commit nu rămâne nici versiune, nici activare, iar profilul activ anterior rămâne încărcabil; după commit ambele rânduri sunt prezente și profilul activ se citește înapoi exact.

**Proveniență și istoric.** Clasificarea sursei este derivată doar din proveniența stocată: `BASE` pentru versiunea rădăcină, `MANUAL_TUNING` pentru o versiune derivată care numează intervenții și `LEARNING` pentru una care numează doar segmente de condus. `getProfileHistory(profileId)` reconstruiește lanțul base→tip din legăturile de părinte stocate, întoarce versiunea activă, secvența și timestamp-ul activării, timestamp-urile versiunilor și listează explicit veriunile lipsă dacă istoricul are o gaură; proveniența, delta și lista surselor sunt citite înapoi exact, fără a fi completate cu date fabricate.

Dovezi: [Evidence/128-save-profiles](Evidence/128-save-profiles/README.md).

## Contract implementat V1 (PBI 129) — segmente, checkpointuri și coada de scriere

`src/persistence/segment-store.ts` (contract `129-segment-store-v1`) scrie segmentele închise (069/090) în store-ul `segments`, cu starea, motivul închiderii și ordinea evenimentelor. Un segment este scris în trei pași: manifestul (care declară câte bucăți urmează și digestul evenimentelor ordonate), bucățile de evenimente și sigiliul, care rescrie manifestul cu starea finală și confirmă digestul.

**Un crash nu produce niciodată un segment valid.** Citirea (`readSegment`) reconstruiește realitatea din rândurile stocate: un manifest nesigilat, o bucată lipsă, o secvență neordonată sau un digest care nu se potrivește se raportează ca `INCOMPLETE` cu un motiv explicit — `UNSEALED_WRITE`, `MISSING_CHUNKS`, `ORDER_VIOLATION`, `DIGEST_MISMATCH` sau `SOURCE_INCOMPLETE` pentru un segment care era deja incomplet la sursă. Citirea întoarce numai evenimentele aflate efectiv în magazie și numelează bucățile lipsă; nu completează niciodată datele lipsă și nu transformă un segment parțial într-unul complet. Evenimentele primesc o secvență monotonă la scriere, iar digestul FNV-1a 64 al listei ordonate detectează orice modificare a conținutului stocat.

**Scrierile nu blochează inputul.** `src/persistence/write-queue.ts` oferă o coadă FIFO limitată (`maxPending`): `enqueue` acceptă segmentul și întoarce imediat, scrierea are loc mai târziu, în afara hot path-ului de tick. Coada scrie un segment pe rând, deci segmentele ajung în magazin în ordinea în care au fost puse în coadă, iar ordinea evenimentelor din interiorul unui segment nu se schimbă niciodată. Coada nu crește fără limită: când este plină, refuză segmentul nou cu `STORAGE_FULL`, iar apelantul decide (retrimitere, export sau abandon explicit).

**Checkpointul unei intervenții active.** `src/persistence/intervention-checkpoint.ts` (contract `129-intervention-checkpoint-v1`) scrie în store-ul `checkpoints` doar identitatea și generația: segmentul, vehiculul, modul de control, tickul de start, generația și `learningEpoch`. Snapshotul complet al lumii rămâne la PBI 206 și nu este inventat aici; o generație mai veche nu înlocuiește una mai nouă (`STALE_REVISION`).

Dovezi: [Evidence/129-save-segments](Evidence/129-save-segments/README.md).

## Contract implementat V1 (PBI 133) — export JSON de profil

`src/persistence/profile-export.ts` (contract `133-profile-export-v1`) produce documentul de export, îl validează și îl citește înapoi. Formatul este versionat și explică schema: `format="self-driving-academy-profile-export"`, `formatVersion=1`, `schemaVersion=1`, `units="SI"`, `createdAt`, `engineVersion` și un checksum `SHA-256` peste forma canonică `SDA-CJSON-1` a întregului document fără câmpul `checksum` — aceleași reguli ca în [modulul 29](29-savefile-si-integritate.md), nu un format nou paralel. Documentul are patru secțiuni: `profile`, `aggregates`, `telemetry` și `checksum`.

**Profilul, versiunile și proveniența.** `profile` conține `profileId`, `source` (BASE, LEARNING sau MANUAL_TUNING, derivat numai din proveniența stocată), `activeVersionId`, `activation` (player, secvență, moment), lista versiunilor și maparea cheilor rezervate. Fiecare versiune păstrează `versionId`, `parentVersionId`, `depth`, `createdAt`, `engineVersion`, `source`, `checksum` (checksum-ul 109 al versiunii), parametrii cu unitatea lor și proveniența completă (origine, segmente, intervenții, delta cu schimbările). Cititorul recalculează checksum-ul 109 al fiecărei versiuni și refuză documentul dacă diferă (`PROFILE_CHECKSUM_MISMATCH`), deci o versiune modificată nu poate fi importată ca atare. Un istoric cu o gaură (părinte lipsă) este refuzat la construire (`HISTORY_INCOMPLETE`), pentru că un lanț incomplet nu poate fi reimportat fără pierderi.

**Cheile rezervate rămân rezervate.** O cheie R (`extension`) din catalogul 092 este rezervată pentru V1: nu este învățabilă și nu poate primi o valoare. Exportul le publică pe toate în `profile.reservedParameters`, fiecare cu valoarea `null`, iar parametrii efectivi (`parameters`) conțin doar cheile utilizabile, cu valoarea și unitatea din catalog. Constructorul refuză o versiune care valorează o cheie rezervată (`RESERVED_KEY_SET`), iar validatorul refuză o cheie rezervată cu valoare (`RESERVED_KEY_SET`), o cheie rezervată lipsă (`RESERVED_KEY_MISSING`) sau o cheie utilizabilă pusă în maparea rezervată (`RESERVED_KEY_INVALID`). O cheie din afara catalogului 092 este refuzată (`UNKNOWN_PARAMETER`): un export care nu poate fi reimportat fără pierderea parametrilor nu este un export.

**Dovezile agregate, nu telemetria brută.** `aggregates` conține contoarele recalculate de cititor (`versions`, `baseVersions`, `derivedVersions`, `manualTuningVersions`, `learningVersions`, `parameters`, `reservedParameters`, `sourceSegments`, `sourceInterventions`), rândurile de indicatori (forma 138: `id`, `unit`, `state`, `value`, `sampleSize`, `reason`) și rândurile de dovezi ale parametrilor (`key`, `effectiveCount`, `quality`, `uncertainty`, `sourceSegmentIds`). Contoarele sunt recalculate din secțiunea profilului la citire, deci un contor fals este refuzat (`AGGREGATE_MISMATCH`). Dovezile și indicatorii sunt agregări: nu conțin evenimente brute.

**Telemetria brută nu intră automat.** Secțiunea `telemetry` publică doar referințe (`referencedSegmentIds`) și, în mod implicit, niciun eveniment brut: `included=false`, `rawEventCount=0`. Evenimentele brute apar numai când apelantul cere explicit includerea, iar cantitatea este plafonată de `maxRawTelemetryEvents` (512); peste plafon, construcția este refuzată (`TELEMETRY_LIMIT_EXCEEDED`). Calea din repository nu poate publica telemetrie brută: repository-ul nu expune niciun cititor de telemetrie, deci `exportProfileFromRepository` produce întotdeauna `included=false`.

**Citirea și refuzurile închise.** `readProfileExport` acceptă textul fișierului sau un obiect deja parsat și folosește un parser JSON strict, nu `JSON.parse`: cheile duplicate sunt respinse (`DUPLICATE_KEY`), conținutul după document este respins (`TRAILING_CONTENT`), `NaN` și `Infinity` nu sunt JSON (`INVALID_LITERAL`), iar mărimea (1 MiB) și adâncimea (24) sunt plafonate (`FILE_TOO_LARGE`, `DEPTH_EXCEEDED`). Cititorul verifică întâi envelope-ul și checksum-ul (`CHECKSUM_MISMATCH` pentru un fișier modificat), apoi schema, referințele și agregatele. Vocabularul de refuz este închis și publicat în `profileExportRejectionCodes`; niciun refuz nu activează parțial un profil.

**Contractul pentru import (134).** Rezultatul citirii reține valorile efective ale versiunii active (`parameters`), cheile rezervate cu `null` (`reservedParameters`) și parametrii fiecărei versiuni, cu proveniența și checksum-ul ei. PBI 134 verifică mai departe compatibilitatea, activează tranzacțional și nu șterge nimic înainte de validare; 133 livrează formatul, validatorul și cititorul pe care 134 le folosesc.

Dovezi: [Evidence/133-export-profile](Evidence/133-export-profile/README.md).

## Contract implementat V1 (PBI 206) — checkpoint complet și reluare coerentă

`src/persistence/world-snapshot.ts` (contract `206-world-snapshot-v1`) este documentul snapshotului, separat de envelope-ul din store-ul `checkpoints` (127/129) și de salvarea progresului. Snapshotul conține numai date simple, înghețate: `tick`, `worldEpoch`, profilul activ, vehiculele (poziție, rotație, viteze, `entityId`↔`handle`, clasă, mod de control, FSM, rută, segment și pasageri), stările controller/FSM cu memoria numerică, cursele și pasagerii, segmentele, oportunitățile evaluate, semafoarele, dispecerul (joburi pending și rezultate acceptate), learning-ul (joburi, observații finalizate, chei de rezultat deja acceptate), cursorii RNG și deduplicarea evenimentelor. Validarea are un vocabular închis: câmpuri lipsă/necunoscute, identități duplicate, referințe suspendate, numere nefinite, depășirea bugetului de dimensiune și versiune incompatibilă sunt refuzate explicit, iar snapshotul nu este niciodată trunchiat.

**Un singur tick coerent.** Captura primește tickul fizicii și tickul fiecărui subsistem; este refuzată dacă fixed-tick loop este în interiorul unui pas (`TICK_NOT_BOUNDARY`) sau dacă orice subsistem nu este exact la tickul capturat (`SUBSYSTEM_TICK_MISMATCH`). Copierea este sincronă și defensivă: după captură, lumea vie poate continua fără să atingă documentul. Integritatea refolosește `SDA-CJSON-1` și `SHA-256` din [modulul 29](29-savefile-si-integritate.md), peste payload-ul fără câmpul `checksum`; citirea verifică checksumul înainte de a folosi orice valoare.

**RNG reluabil, nu re-generat.** Fiecare stream (`traffic`, `rideDemand`, `opportunities`) este un cursor într-un generator keyed (`randomUnit`), nu `Math.random`. Snapshotul păstrează seed-ul și cursorii, iar `advanceWorldRng` întoarce valoarea și cursorul următor, deci lumea restaurată vede exact șirul pe care lumea originală l-ar fi văzut.

**Reluarea este o decizie explicită.** `restoreWorldState` întoarce starea și un plan `206-world-resume-v1`: sesiunea pornește `PAUSED_AUTO`, inputul este eliberat, toate vehiculele trec în `AUTO`, segmentele `OPEN` devin `INCOMPLETE` cu motivul `RELOAD`, iar joburile pending sunt `RELAUNCH` numai dacă `profileId` și `learningEpoch` corespund profilului activ; altfel sunt `INVALIDATED` cu motivul exact (`PROFILE_MISMATCH`, `LEARNING_EPOCH_MISMATCH` sau ambele). Observațiile LEARNING finalizate sunt reluabile idempotent, cu cheie `segmentId:observationId`, iar rezultatele deja acceptate sunt păstrate fără să reaplice reward-ul (`rewardsReapplied: 0`).

**Un writer, o generație în pregătire, una în commit.** `src/persistence/world-checkpoint.ts` (contract `206-world-checkpoint-v1`) cere repository-ul în starea `READY` și rolul `WRITER` (127); un al doilea tab poate citi, dar captura este refuzată cu `WRITER_REQUIRED`, iar un token de la alt writer este refuzat la commit cu `WRITER_MISMATCH`. O cerere identică (același tick și aceeași generație) este coalesced, o generație mai nouă înlocuiește pregătirea, iar un tick sau o generație mai veche este refuzat (`STALE_TICK`, `STALE_GENERATION`). Un singur commit rulează odată (`COMMIT_IN_PROGRESS`); commitul scrie envelope-ul și snapshotul într-o singură tranzacție, deci un crash înainte de tranzacție nu lasă niciun rând, iar unul după commit este raportat ca `CRASHED_AFTER_COMMIT` cu rândul deja durabil.

**Pierderea GPU nu pierde captura.** Captura pregătită este deja o copie simplă în heap-ul JS. La `deviceLoss`, writer-ul trece în `LOST`, păstrează captura pregătită și o etichetează `RAM`; commitul durabil este refuzat cu `DEVICE_LOST`, iar `commitDeferred` refuză până la `integrateRecovery()` cu `DEVICE_NOT_INTEGRATED`. După integrare, captura din RAM este publicată, iar `lastCommit.device` rămâne `RAM`.

**Costul este atribuit, nu ascuns.** Citirea sincronă a lumii (`captureMs`), validarea/canonicalizarea/checksum-ul (`encodeMs`) și tranzacția (`commitMs`) sunt măsurate separat, cu un ceas monotonic injectabil. Transcriptul determinist folosește un ceas scriptat (`STUB_CLOCK`); costul real al mașinii este scris separat în `cost.json` de `--cost` și nu intră niciodată în `report.json`. Snapshotul de 70 de vehicule are 64 378 bytes din bugetul de 262 144, iar citirea completă a raportului confirmă cele 98 de verificări.

**Încărcarea nu promite ce nu poate continua.** `loadLatestWorldCheckpoint` verifică checksumul, coerența envelope↔snapshot (tick, profil, `learningEpoch`) și versiunile engine/fizică/hartă. O versiune diferită întoarce `INCOMPATIBLE` cu detaliul exact, astfel încât checkpointul poate fi exportat, dar lumea veche nu este reluată tacit. Vârsta checkpointului este raportată în tickuri, nu dedusă din ceas.

Dovezi: [Evidence/206-world-checkpoint](Evidence/206-world-checkpoint/README.md).
