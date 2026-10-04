# Salvare și import export

Versiune 0.4 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

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
