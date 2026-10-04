# Salvare și import export

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Date salvate și export

IndexedDB stochează metadate de sesiune, profiluri și delte, dovezi agregate, segmente manuale, progresul misiunilor, scenarii și setări. Salvarea periodică propusă este la 15 secunde și la închiderea intervenției, publicare de profil și final de misiune. Intervalul va fi calibrat după volum.

Un export de profil JSON include schema, versiuni, parametri, dovezi agregate și proveniență minimă. Nu include automat toată telemetria. Un export de sesiune separat poate include segmente și scenarii, cu descrierea dimensiunii.

Importul validează schema, cheile permise, unitățile, numerele finite, intervalele, versiunea motorului și mărimea fișierului. Datele sunt tratate ca date, fără evaluare de cod. Cheile necunoscute rămân inactive sau sunt respinse cu explicație; un profil incompatibil nu devine activ parțial.

Scrierea profilului și a activării se face tranzacțional. Un crash nu lasă un profil activ care nu poate fi încărcat. La depășirea cotei locale, aplicația oferă export și eliminarea replay-urilor vechi; nu șterge automat profilul curent sau progresul. Păstrarea propusă a telemetriei brute este o fereastră recentă de 30 de minute de condus manual, cu posibilitatea de a fixa segmente; dovezile agregate se păstrează separat.

Salvarea locală depinde de datele browserului. Ștergerea acestora sau folosirea altui browser nu transferă automat progresul. Exportul este mecanismul de transfer și backup din prima versiune.

## Tranzacții și migrare

Repository-ul local validează înainte de commit și păstrează o referință activă existentă dacă importul eșuează. Exportul de profil și exportul de sesiune sunt operații diferite. Migrarea schemei păstrează proveniența și marchează dovezile incompatibile fără a transforma lipsa lor în zero.

UI arată pending, succes sau eroare după rezultatul real al scrierii. Posibilitatea de export rămâne accesibilă când rendererul nu poate porni. V3 extinde starea salvată cu personaj și entitate controlată, fără a crea autorități duplicate la reload.
