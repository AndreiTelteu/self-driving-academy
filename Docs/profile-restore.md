# Restaurare, import și profil nou — PBI 114

`src/app/profile-restore.ts` (contract `114-profile-restore-v1`) este composition root-ul care
rezolvă o schimbare explicită a țintei de învățare: restaurarea unei versiuni vechi, importul unui
profil validat și crearea unui profil nou de la bază. Fiecare cale folosește bariera reală 205 și
publică exact o activare comună nouă prin controllerul 110. Modulul este exportat aditiv prin
`src/app/index.ts`.

```typescript
import { importProfile, newProfileFromBase, resetStyle, restoreVersion } from './app';

const restored = restoreVersion(services, { profileId, versionId, tick });
const imported = importProfile(services, { importedProfile, tick });
const created = newProfileFromBase(services, { playerId, profileId, baseParameters, tick });
const reset = resetStyle(services, { profileId, tick, progression });
```

`services` leagă store-ul real 109, bariera reală 205, readback-ul de tick, opțional readback-ul 110
și, pentru un `profileId` diferit, o fabrică de bariere pinned (`barrierFor`). Modulul nu creează
versiuni în afara căii de import/profil nou, nu editează niciun record și nu scrie XP sau misiuni.

## Ciclul în două apeluri

Bariera 205 se rezolvă numai la limita tick-ului. Primul apel la tick-ul `t` înregistrează bariera
și întoarce `PENDING`; al doilea apel la `t + 1` găsește aceeași barieră `PENDING`, o rezolvă și
întoarce `COMMITTED` cu activarea. Un apel repetat după commit este `ALREADY_ACTIVE`, fără o a doua
barieră. Rezultatul este înghețat la adâncime și conține `status`, `provenance`, `reason`,
`barrierId`, `activation`, `versionId`, `versionCreated`, `versionsAdded`, `tick` și un `report`
determinist.

## Proveniență și activare

| Cale | Proveniență | Motiv 205 | Origine 110 | Efect în 109 |
| --- | --- | --- | --- | --- |
| `restoreVersion` | `RESTORE` | `RESTORE` | `RESTORE` | niciunul; versiunea existentă este ținta |
| `importProfile` | `IMPORT` | `IMPORT` | `IMPORT` | o versiune imuabilă nouă, cu părinte explicit |
| `newProfileFromBase` | `NEW_PROFILE` | `NEW_PROFILE` | `MANUAL_TUNING` | o versiune de bază nouă |
| `resetStyle` | `RESET_STYLE` | `RESTORE` | `RESTORE` | niciunul; baza existentă este ținta |

110 nu are o origine `NEW_PROFILE`, deci profilul nou este publicat cu originea închisă
`MANUAL_TUNING`. Proveniența cererii rămâne `NEW_PROFILE` în rezultat și în raport.

## Restaurare

`restoreVersion` citește versiunea din store și verifică: existența, apartenența la `profileId`,
engine-ul identic cu store-ul și checksum-ul 109. Versiunea nu este clonată, derivată sau editată;
numărul de versiuni și checksum-urile rămân identice după commit. O țintă deja activă este
`ALREADY_ACTIVE` și nu deschide barieră. După commit, modulul reverifică checksum-ul și parametrii
țintei; o modificare ar fi raportată `VERSION_MUTATED`, nu ascunsă.

## Import

`importProfile` validează payload-ul prin calea reală de publicare 109/092
(`parsePublishableDrivingProfile`: schemă, unități SI, chei și intervale din catalog, proveniență
`IMPORTED`/`BASE`), apoi verifică engine-ul și profilul. Versiunea este scrisă prin
`store.derive`, deci poarta numerică 102 injectată în storeul canonic validează fiecare schimbare
față de părintele explicit. În 109, proveniența `IMPORTED` este purtată de
`provenance.delta.reason = 'IMPORTED'` și de identitatea de segment `import:<checksum>`; câmpul
înghețat `provenance.origin` rămâne `BASE`/`DERIVED`, singurele valori 109.

Un import invalid este `REJECTED` cu `IMPORT_INVALID` **înainte** de orice efect: nu creează
barieră, nu închide segmentul, nu anulează joburi, nu publică activare și nu scrie în store. Coada,
jobul și segmentul curent rămân exact cum erau. Re-importul aceluiași checksum/versiune este
idempotent: versiunea existentă este refolosită, nu se creează un al doilea record, iar dacă ținta
este deja activă rezultatul este `ALREADY_ACTIVE`.

## Profil nou

`newProfileFromBase` creează o versiune de bază 109 cu valorile implicite reale din catalogul 092
(sau cu `baseParameters` validate), apoi publică bariera `NEW_PROFILE` și o activare comună.
Istoricul celorlalte profiluri nu este atins. 205 este pinned pe un singur profil; pentru un
`profileId` diferit gazda trebuie să injecteze `barrierFor`, care întoarce o barieră stabilă pentru
generația existentă a profilului respectiv. Fără această fabrică, cererea este `REJECTED`
(`TARGET_PROFILE_MISMATCH`) înainte de orice scriere. Un profil fără nicio generație anterioară nu
poate primi o barieră 205 și este raportat `BASE_NOT_FOUND`; prima țintă a unui profil complet nou
rămâne o activare inițială, nu o schimbare de epocă.

## Reset de stil

`resetStyle` activează versiunea de bază/system a profilului printr-o barieră `RESTORE`, fără să
creeze o versiune învățată. Nu apelează niciun port de progresie: XP, nivelul, misiunile și
provocările rămân identice. Portul `progression` este acceptat numai pentru a putea fi spionat;
`progressionCalls` este întotdeauna `0`, iar istoricul și checksum-urile 109 rămân neschimbate.

## Bariera și sesiunea activă

La commit, 205 închide segmentul curent cu `PROFILE_CHANGE`, păstrează readback-ul fizic
byte-identic, anulează joburile 103 nepublicate din generația veche, incrementează `learningEpoch`
cu un pas și deschide segmentul următor. Un rezultat târziu din segmentul anulat este `LATE_RESULT`
și nu poate produce o versiune. Modulul nu repară un rollback: `BARRIER_ROLLED_BACK` păstrează
raportul real 205.

## Ce nu este

- Nu este 109: nu inventează versiuni, nu editează recorduri și nu ocolește validatorul 102.
- Nu este 110: nu aplică activarea la flotă și nu mișcă vehicule; publicarea rămâne a barierei 205.
- Nu este 205: nu închide singur segmente și nu inventează o tranziție de epocă.
- Nu este progresie sau misiuni: nu acordă XP, nu completează misiuni și nu resetează nivelul.
- Nu este import de savegame: nu transferă XP, misiuni, istoric de curse sau alte profile.
- Nu are captură de browser, măsurători hardware sau persistență pe disc.

## Limite

- Integrarea 109/110/205 este RAM-only; nu există savefile, IndexedDB sau recuperare după crash.
- Importul aplică numai chei deja prezente în părintele 109 și numai chei acceptate de poarta 102;
  o cheie R/extension schimbată este `IMPORT_INVALID`, nu o extindere tacită a schemei.
- Un `profileId` diferit cere o barieră/activare pinned injectată de gazdă; modulul nu creează 110.
- Fără un profil cu generație existentă, un profil nou nu poate folosi bariera 205.
- Rezultatele nu certifică performanța jocului integrat.

## Verificare

`tests/app/profile-restore.test.ts` acoperă 17 teste: contract, restore cu barieră și activare,
`ALREADY_ACTIVE`, versiune inexistentă/străină, import valid cu părinte explicit și marcaj
`IMPORTED`, import duplicat idempotent, import invalid fără efecte pe store/coadă/activare, profil
nou cu bază din catalog, profil nou fără barieră pinned, reset fără apeluri de progresie,
`ALREADY_ACTIVE` la reset, sesiune activă cu job anulat și stare fizică păstrată, rezultate
înghețate/deterministe și imuabilitatea istoricului.

```powershell
npm run profile:restore
npm run profile:restore -- --check
```

Runnerul scrie [report.json](Evidence/114-profile-restore/report.json) și
[report.md](Evidence/114-profile-restore/report.md): 7 scenarii deterministe (restore, deja activ,
import valid, import invalid, profil nou, reset de stil cu zero apeluri XP/misiuni, sesiune activă)
și 62 de verificări. `npm test` include testele modulului.
