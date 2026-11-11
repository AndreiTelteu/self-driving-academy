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

## Contract implementat V1 (PBI 135) — arhiva de sesiune

Arhiva este un document JSON versionat (`self-driving-academy-session-archive`, `formatVersion 1`, `schemaVersion 1`, unități `SI`) care capturează **o singură sesiune** și o poate înlocui integral. Nu este savefile-ul `.sdasave` al modulului 234 (acela adaugă envelope-ul, acțiunile de fișier și confirmarea UI peste snapshotul de aici) și nu este exportul de profil 133 (profilul rămâne o acțiune separată, 134).

### Structura explicită și mărimea declarată

Fiecare componentă are propriul slot, cu parserul modulului care o deține; `null` înseamnă „absent”, nu „gol”:

| Slot | Conținut | Parser la citire |
| --- | --- | --- |
| `checkpoint` | rândul 206/127 al lumii (`CheckpointRecord`, cu `body` = snapshot 206) | `parseCheckpointRecord` + `readWorldSnapshot` |
| `progress` | rândul 130 `MISSION_TRACKER` al sesiunii | `parsePersistedRecord` + `decodePlayerSave` |
| `campaign` | rândul 130 `CAMPAIGN_LEDGER` al sesiunii | `parsePersistedRecord` + `decodePlayerSave` (rejucarea 125) |
| `settings` | rândul 009 `RuntimeSettings` al jucătorului | `parseSettingsRecord` |
| `profile` | referința de generație: `profileId`, `activeVersionId`, `activationSequence`, checksumul 109 al versiunii, `engineVersion` și rândul 110 de activare | `parseActivationRecord` |
| `scenarios` | rânduri 127 `SCENARIO` explicite (maximum 8) | `parsePersistedRecord` |

Documentul declară un **bilanț de mărime** (`sizes`): bytes canonici UTF-8 pentru fiecare componentă, suma lor (`total`) și plafonul față de care a fost construit (`limit = 2 097 152`). Cititorul remăsoară fiecare componentă cu `measureJsonBytes` (bugetul 127, adică exact ce poate fi scris înapoi), refuză o declarație care nu corespunde (`SIZE_MISMATCH`), o componentă peste bugetul ei (`COMPONENT_TOO_LARGE`: checkpoint/progres/campanie/scenarii 524 288, setări 131 072, referință profil 65 536) și un total peste plafon (`ARCHIVE_TOO_LARGE`). O arhivă prea mare este **refuzată explicit, niciodată trunchiată**.

### Integritate

Envelope-ul are `checksum = { algorithm: "SHA-256", canonicalization: "SDA-CJSON-1", value }`, calculat peste forma canonică a întregului document fără câmpul `checksum` (deci include metadatele, componentele și bilanțul de mărime). Se refolosesc `parseStrictJson`/`canonicalizeJson`/`sha256Hex` din 206/133; nu există un al doilea parser și nici un fallback fără integritate. `formatVersion`/`schemaVersion` mai noi decât build-ul sunt refuzate **înainte** de interpretarea checksumului (`FORMAT_VERSION_TOO_NEW`, `SCHEMA_TOO_NEW`).

Checksumul de envelope nu este singura barieră: snapshotul 206 își păstrează checksumul propriu (verificat de `readWorldSnapshot`), rândurile 130 își păstrează digesturile (recalculate de decodor), iar jurnalul de campanie este **rejucat** în ledgerul 125 real și comparat cu digestul și totalurile stocate. Un fișier rescris și re-stampat corect este deci încă refuzat dacă lumea, progresul sau economia nu mai reproduc contractele lor.

### Coerență înainte de orice scriere

Ordinea la import este: limită de mărime/adâncime → parsare strictă → envelope/checksum → declarația de mărime → parserele componentelor → coerența între componente → (abia apoi) tranzacția. Coerența verificată:

- fiecare componentă aparține aceleiași `sessionId` și aceluiași `worldEpoch` (`SESSION_MISMATCH`, `WORLD_EPOCH_MISMATCH`);
- checkpointul folosește tripla engine/fizică/hartă a documentului (`VERSION_MISMATCH`) și snapshotul lui coincide cu propriul envelope (tick, `worldEpoch`, `learningEpoch`, `profileId`), exact regulile de citire ale 206;
- referința de profil este chiar generația checkpointului: `profileId`, `activeVersionId` și `activationSequence` din snapshotul lumii trebuie să fie identice cu slotul `profile` și cu rândul 110 de activare (`PROFILE_GENERATION_MISMATCH`);
- rândurile de progres sunt exact rândurile documentate 130 (`tracker:<sessionId>`, `campaign:<sessionId>`), au `sessionId`/`worldEpoch`-ul sesiunii, iar decodorul 130 acceptă snapshotul de tracker și rejucarea campaniei împotriva catalogului acestui build;
- setările aparțin jucătorului sesiunii (`SETTINGS_INVALID`), iar scenariile aparțin sesiunii și epocii lumii.

Un checkpoint care trimite la un profil inexistent este **refuzat**, nu „reparat”: la import, versiunea 109 numită trebuie să existe deja în baza țintă, cu același checksum, iar activarea 110 stocată trebuie să fie exact generația numită (`PROFILE_VERSION_MISSING`, `PROFILE_GENERATION_MISMATCH`). Importul de profil rămâne acțiunea explicită 134 și nu este un bypass pentru Load game.

### Import atomic și înlocuitor

`commitSessionArchiveRows` rulează într-o **singură tranzacție** peste `profiles`, `profileActivations`, `checkpoints`, `progress`, `settings` și `scenarios`:

1. rezolvă referința de profil înainte de prima scriere;
2. citește și validează fiecare rând care va fi șters (un rând stocat corupt este raportat, nu suprascris tăcut);
3. șterge rândurile de progres, scenariile și checkpointurile sesiunii și rândul de setări al jucătorului — starea este **înlocuită**, nu fuzionată, deci nu pot rămâne rânduri orfane sau două economii paralele;
4. scrie generația arhivei: cele două rânduri 130 cu revizie monotonă, setările (sau valorile implicite documentate dacă arhiva nu le are), scenariile explicite și checkpointul 206;
5. recitește sesiunea **în aceeași tranzacție** și compară digesturile 130 și totalul XP cu arhiva; orice diferență anulează tot (`SAVE_DIGEST_MISMATCH`, `LEDGER_REPLAY_MISMATCH`).

Recompensele **nu se adună**: modulul nu apelează niciodată `settle`, rândul de campanie este scris verbatim din arhivă, iar verificarea din tranzacție compară XP-ul scris cu cel arhivat. O arhivă invalidă, un eșec înainte de commit sau o lipsă de storage lasă sesiunea anterioară **byte cu byte** neatinsă; un import repetat al aceleiași arhive este idempotent. Ca și restul persistenței, importul cere pagina care deține lock-ul de scriitor (`WRITER_REQUIRED` pentru al doilea tab).

### Scenarii

Scenariile nu sunt un câmp liber: fiecare este un rând 127 `SCENARIO` validat (`sessionId`, `worldEpoch`, identitate unică, plafon de 8 rânduri, buget de componente), iar la import setul de scenarii al sesiunii este înlocuit cu cel din arhivă. Replay-urile și telemetria brută nu fac parte din arhivă; ele rămân opționale și separate, conform politicii de retenție.

### Acoperire și verificare

Testele deterministe (`tests/persistence/session-archive.test.ts`, 15 cazuri) acoperă round-trip export→import, arhivă cu checksum modificat, jurnal de campanie rescris cu envelope re-stampat, referință de profil ruptă, rând din altă sesiune, componentă peste buget, total declarat peste plafon, mărime declarată greșită, import peste o sesiune cu mai multe recompense, import repetat, rollback înainte de commit, al doilea tab, generație de profil deplasată, arhivă fără componente, chei duplicate și format mai nou. Transcriptul numeric este `Docs/Evidence/135-session-archive/report.json` (58/58 verificări), regenerabil cu `npm run save:session-archive` și verificabil cu `-- --check`.

## Contract implementat V1 (PBI 215) — KPI, daily și XP în arhivă

Arhiva de sesiune are o versiune 2 (`215-session-archive-economy-v1`): envelope-ul 135 rămâne neatins ca document interior, iar lângă el apare un singur slot nou, `economy`, cu bundle-ul economic al sesiunii. Fișierul vechi (versiunea 1) este în continuare citit de cititorul 135 și raportat `LEGACY`; un fișier versiunea 2 este refuzat de un build vechi cu `FORMAT_VERSION_TOO_NEW`, nu interpretat optimist.

| Slot v2 | Conținut | Parser la citire |
| --- | --- | --- |
| `session` | documentul 135 complet (checkpoint, progres, campanie, setări, referință profil, scenarii), cu checksumul lui propriu | `readSessionArchive` (135) |
| `economy` | bundle-ul `215-economy-save-v1`: `daily` (snapshot 212), `economy` (ledger 209 + review-uri 209 + bucketuri KPI 209) și `player` (checkpoint 213) | `restoreDailyProgress` (212), validarea structurală 209, `parsePlayerProgress` (213) |

**Nicio valoare de business nu este recalculată.** Bundle-ul este exact documentul pe care l-au produs contractele: `ledger.snapshot(tick)`, `reviews.snapshot(tick)`, `kpi.snapshot(tick)`, `daily.snapshot()` și `player.checkpoint()`. Persistența nu emite devize, nu acordă review-uri, nu creditează XP și nu reconstruiește bucketurile din settle-uri, deci `historyScans` rămâne structural `0` în ledger, review-uri, KPI și în read model-ul persistat.

**Citirea folosește parserul proprietarului.** Snapshot-ul daily trebuie să treacă prin `restoreDailyProgress` și să iasă identic (comparație canonică), checkpointul XP trebuie să treacă prin `parsePlayerProgress` și să iasă identic, iar un credit negativ este refuzat de validatorul 213 (`PLAYER_INVALID`). Bundle-ul 209 nu are punct de restaurare în modulul lui, deci este verificat structural: versiuni închise (`209-fleet-ledger-v1`, `209-review-v1`, `209-fleet-kpi-v1`), `historyScans: 0`, identități unice, referințe `charge`/`refund` existente, `net = charged − refunded`, `terminalRides = completed + failed + cancelled`, media exactă `ratingSum / reviewCount`, histograma 0–5 care însumează `reviewCount`, plus invarianta „dovezile reținute nu depășesc totalurile”. Un fișier rescris și re-stampat corect rămâne supus acestor invariante; tarifele și notele nu sunt niciodată recalculate aici.

**Durabilitate și mărime.** Bundle-ul este un singur rând 127 `meta` cu cheia `economy:<sessionId>`, deci reload-ul citește exact aceiași octeți, iar exportul pre-migrare 136 îl cară neschimbat. Plafoanele se derivă din manifestul 127: documentul ≤ `maxRecordBytes` (1 048 576), `daily` și `player` ≤ `maxBodyBytes` (262 144), `economy` ≤ jumătate de record (524 288), arhiva v2 ≤ 2 097 152 + 4 096 + 1 048 576. O componentă peste plafon este refuzată explicit (`COMPONENT_TOO_LARGE`), niciodată trunchiată, iar o declarație de mărime care nu corespunde măsurătorii este `SIZE_MISMATCH`.

**Import: înlocuire, nu adunare.** Importul rulează într-o singură tranzacție peste store-urile 135 plus `meta`: `commitSessionArchiveRows` înlocuiește componentele sesiunii, apoi rândul `economy` este scris sau șters, iar tranzacția recitește rândul și îl compară canonic cu documentul. Nu există niciun apel `settle`, `creditMission`, `creditDaily` sau `recordDailyReward`: un al doilea import al aceleiași arhive scrie aceiași octeți (revizia rândului crește, soldul XP rămâne 100,5 și există tot o singură recompensă daily). O arhivă versiune 1 importă sesiunea și lasă slotul economic `UNCHANGED`, fiindcă fișierul nu a purtat niciodată date economice. Importul cere lock-ul de scriitor (`WRITER_REQUIRED` pentru al doilea tab), iar un refuz (checksum, mărime, quota `STORAGE_FULL`, hook înainte de commit) lasă sesiunea și bundle-ul byte cu byte neschimbate.

**Migrare aditivă.** `upgradeSessionArchive` copiază documentul 135 neschimbat — checksum-ul lui propriu dovedește asta — și adaugă slotul `economy` ca `null` dacă apelantul nu are încă un bundle. Un document care declară deja versiunea 2 este refuzat: nu este date mai vechi.

**Exportul de DrivingProfile rămâne separat.** 133/134 nu citesc și nu scriu `meta` sau acest bundle, deci un import de stil nu transferă și nu resetează XP, daily sau istoricul comercial; `player.profileWrites` rămâne structural `0`.

Dovezile reale sunt în [Evidence/215-save-economy](Evidence/215-save-economy/README.md): `npm run save:economy` produce un raport determinist cu 32/32 verificări (bundle 14 005 bytes din 1 048 576, rând 14 647 bytes din 1 048 576, arhivă v2 80 033 bytes din 3 149 824), sold 100,5 XP și nivel 2 identice după export→import, 3 settle-uri, 1 review, 1 zi KPI cu venit 690 SDA și o recompensă daily, `historyScans: 0`, delta 0 XP la al doilea import și toate refuzurile închise.

## Acoperire și verificare

135/215 furnizează exportul coerent și persistența existentă; 234 implementează envelope-ul, checksumul și acțiunile de fișier, 235 regresiile integrate. Vectorii de verificare acoperă Unicode, obiecte imbricate, reordonarea cheilor/whitespace, -0, array-uri reordonate, base64, chei duplicate și numere unsafe. Se testează roundtrip, editarea XP fără checksum nou, checksum recalculat cu schemă invalidă, checksum lipsă/greșit, fișier trunchiat/prea mare, migrare, două taburi, quota și reload. Nicio eroare nu activează parțial profiluri sau recompense. Benchmarkul verifică export/import în pause pe istoricul maxim admis și menține UI cu progres/anulare.
