# Savefile și verificarea integrității

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Scope V1 acceptat. Acesta este contractul de implementat în browser, nu o funcționalitate deja disponibilă.

## Save game to file / Load game from file

Meniul de pauză și ecranul inițial au „Salvează jocul în fișier” și „Încarcă jocul din fișier”. Fișierul JSON .sdasave este un backup complet, distinct de exportul unui DrivingProfile și de exportul unui scenariu. Include checkpointurile Academie/Haos, sesiunea selectată, profilurile și proveniența lor, preferințele, progresul campaniei/daily/XP, istoricul economic, provocările/recordurile și decorul destructibil. Replay-urile voluminoase sunt opționale, cu dimensiunea afișată; lipsa lor nu invalidează jocul salvat.

La export se pune sesiunea pe pauză, se închide segmentul și se capturează o generație coerentă. Payloadul nu combină lumea unui checkpoint cu reward-urile altuia. Snapshotul și conversia datelor binare în base64 standard au limite de bytes; hashingul/encodingul au buget conform pipeline-ului 222. UI arată starea „Se pregătește fișierul”, data/checkpointul inclus și „Fișier pregătit pentru descărcare”; nu pretinde confirmarea scrierii pe disk dacă browserul nu o oferă. Autosave în browser și backupul descărcat au stări distincte.

## Format și checksum

Envelope-ul conține format="self-driving-academy-save", formatVersion, integrityVersion, createdAt, payload și checksum={algorithm:"SHA-256", canonicalization:"SDA-CJSON-1", value:"...64 caractere hex lowercase..."}. Payloadul include versiunile engine/fizică/hartă/schema. Checksumul este calculat în browser asupra UTF-8 al reprezentării canonice a întregului envelope fără câmpul top-level checksum. Astfel include metadatele și payloadul, dar nu se include pe sine.

SDA-CJSON-1 folosește aceste reguli versionate, comune pentru export și import:

1. Acceptă exclusiv valori JSON, fără NaN/Infinity/undefined sau tipuri executabile. Obiectele cu chei duplicate în fișier sunt respinse înainte de hashing; parserul de import nu acceptă tăcut „ultima valoare”.
2. Cheile obiectelor sunt sortate lexicografic după unitățile UTF-16, la fiecare nivel; ordinea array-urilor se păstrează. Nu se normalizează Unicode.
3. Cheile/stringurile și numerele finite sunt serializate prin regulile JSON.stringify ale browserului; -0 devine 0. Boolean/null sunt literalele JSON standard. Nu există whitespace între token-uri. Câmpurile integer din schemă trebuie să fie safe integers; sumele nu se importă rotunjite.
4. Datele binare din payload sunt stringuri base64 validate, cu encoding declarat în schemă. Datele calendaristice sunt stringuri ISO validate.
5. Se calculează SHA-256 al bytes UTF-8, apoi se compară valoarea hex strict validată. Algorithm/canonicalization necunoscute sau checksum lipsă sunt erori, nu fallback la import fără integritate.

Indentarea și ordinea cheilor din fișier pot fi schimbate fără eroare dacă datele rămân identice. O schimbare de XP, profil, decor, metadate sau alt câmp acoperit, fără recalcularea checksumului, produce „Fișierul a fost modificat sau este corupt. Jocul nu a fost încărcat.” Cod intern: CHECKSUM_MISMATCH. Nu există buton pentru ignorarea erorii.

Checksumul detectează modificări fără recalculare și corupere; nu este semnătură și nu garantează anti-cheat. Cine modifică payloadul și recalculează corect checksumul poate trece verificarea de integritate, dar trebuie să treacă și schema/compatibilitatea. Jocul local nu păstrează o cheie secretă pretins sigură și nu promite scor verificat de server.

## Import fără coruperea sesiunii

Ordinea este: limită de mărime/adâncime, parsare strictă, envelope/checksum, schema/versiuni/referințe, migrare în staging și commit atomic. 203/222 fixează limitele concrete; fișierele excesive sunt respinse înainte de alocări/copieri masive. Se resping intervale invalide, IDs inconsistente, XP negativ, chei periculoase pentru prototype pollution și referințe inexistente chiar dacă hashul corespunde.

Schema veche se migrează numai după verificarea checksumului folosind regulile versiunii originale. La export ulterior se generează checksumul noii versiuni. Formatul savefile nou nu acceptă fișiere fără checksum ca salvări valide; importul vechi de profil/scenariu rămâne separat, etichetat și nu este un bypass pentru Load game. O versiune prea nouă produce eroare explicabilă.

Înainte de înlocuire, UI arată sumarul fișierului validat și cere confirmarea înlocuirii sesiunii, păstrând un checkpoint de recuperare al sesiunii curente. Nu cere utilizatorului să aprobe un fișier neverificat. Commitul înlocuiește progresul, nu îl adună; inputul este eliberat, joburile precedente sunt invalidate și jocul pornește în pauză/AUTO. Daily se reconciliază cu data reală potrivit modulului 23. Eșecul parsingului, hashingului, migrării, pregătirii lumii sau storage-ului păstrează sesiunea anterioară. Limita de un writer între taburi se aplică și aici.

## Acoperire și verificare

135/215 furnizează exportul coerent și persistența existentă; 234 implementează envelope-ul, checksumul și acțiunile de fișier, 235 regresiile integrate. Vectorii de verificare acoperă Unicode, obiecte imbricate, reordonarea cheilor/whitespace, -0, array-uri reordonate, base64, chei duplicate și numere unsafe. Se testează roundtrip, editarea XP fără checksum nou, checksum recalculat cu schemă invalidă, checksum lipsă/greșit, fișier trunchiat/prea mare, migrare, două taburi, quota și reload. Nicio eroare nu activează parțial profiluri sau recompense. Benchmarkul verifică export/import în pause pe istoricul maxim admis și menține UI cu progres/anulare.
