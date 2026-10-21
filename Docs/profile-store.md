# Profiluri imuabile și istoric versionat — PBI 109

`src/profiles/profile-store.ts` stochează versiuni de profil în memorie, imuabile și legate
explicit de baza lor. Modulul este exportat prin `src/profiles/index.ts`; legarea canonică la
validarea numerică 102 este `createCandidateProfileStore` din `src/learning`.

```typescript
import { createCandidateProfileStore } from '../learning';

const store = createCandidateProfileStore({ engineVersion: 'engine-1' });
store.createBase({ profileId: 'academy', versionId: 'base-1', parameters });
store.derive({
  profileId: 'academy',
  versionId: 'v2',
  parentVersionId: 'base-1',
  segmentId: 'segment-42',
  interventionId: 'intervention-42',
  delta: { profileVersionId: 'v2', parentVersionId: 'base-1', engineVersion: 'engine-1', values },
});
```

## API

- `createProfileStore(options)` — creează un store pentru un `engineVersion`. `validateDelta`
  este obligatoriu și injectat; `maxVersions`, `maxVersionsPerProfile`, `maxInterventions` și
  `now` sunt opționale.
- `createCandidateProfileStore(options)` — leagă portul la `validateCandidateDelta` (102).
- `createBase(input)` — creează versiunea de bază: `parentVersionId: null`, `depth: 0`, proveniență
  `BASE` și lista segmentelor/intervențiilor sursă.
- `derive(request)` — creează un copil dintr-un părinte existent aplicând un delta validat.
- `getVersion(versionId)` — copie înghețată la adâncime sau `null`.
- `listVersions(profileId?)` — copii în ordinea creării, opțional filtrate pe profil.
- `getHistory(profileId, versionId?)` — lanțul bază → vârf; fără `versionId` pornește de la ultima
  versiune a profilului.
- `getInterventionVersion(profileId, segmentId)` — versiunea produsă de un segment.
- `stats()` — contoare înghețate; `clear()` și `dispose()` — ciclul de viață.
- `PROFILE_STORE_VERSION`, `PROFILE_STORE_POLICY`, `PROFILE_STORE_LIMITS`,
  `profileStoreRejectionCodes`, `computeProfileVersionChecksum` și
  `verifyProfileVersionChecksum`.

Rezultatul este exclusiv pe două ramuri: `ACCEPTED` (cu `versionId`, `profileVersion` copie,
`created` și `deduplicated`) sau `REJECTED` (cu `rejection.code` din vocabularul închis). Nu există
un al treilea rezultat și nicio versiune parțială.

## Imuabilitate

Fiecare `ProfileVersion` este înghețată la adâncime: parametrii, proveniența, listele de segmente,
schimbările de delta și fiecare intrare sunt `Object.freeze`. `getVersion`, `listVersions` și
`getHistory` întorc copii înghețate, nu referințe interne, astfel încât un apelant nu poate altera
istoricul. O versiune nu este niciodată editată în loc: o schimbare produce un copil nou, iar
părintele își păstrează valorile și checksum-ul.

## Versionare și delta

O versiune derivată conține `versionId`, `parentVersionId`, `engineVersion`, adâncimea, valorile
complete ale tuturor parametrilor și proveniența. `provenance.delta` păstrează:

- `baseVersionId` — exact părintele folosit, deci delta nu poate face o înlocuire absolută ascunsă;
- `validationVersion` — contractul validatorului (102);
- `segmentId`, `interventionId`, `reason`;
- `changes` cu cheia, unitatea, valoarea anterioară din părinte și valoarea nouă.

Cheia trebuie să existe deja în părinte; o cheie nouă este `DELTA_KEY_NOT_IN_BASE`. Valorile
neschimbate de delta sunt copiate din părinte. `sourceSegmentIds` și `sourceInterventionIds`
cumulează proveniența lanțului, fără duplicate.

Checksum-ul este un FNV-1a 64-bit determinist peste conținutul canonic (parametri sortați,
proveniență, adâncime, timp), nu un hash criptografic. Este stabil între citiri și diferă la orice
modificare de valoare, engine, bază sau proveniență. `verifyProfileVersionChecksum` reverifică un
record.

## Idempotență

Identitatea intervenției este `segmentId`, cu `interventionId` păstrat ca metadată de proveniență și
scopat pe `profileId`. Dacă același segment este trimis din nou cu același părinte, engine și set de
chei/valori, store-ul nu creează o versiune nouă: întoarce `ACCEPTED`, `deduplicated: true` și
`versionId`-ul existent. Reîncercarea funcționează și cu un `versionId` nou sau cu un `createdAt`
nou, pentru că semnătura idempotenței include baza, engine-ul și valorile, nu identitatea cererii.
Un segment cunoscut cu alt payload este refuzat `INTERVENTION_CONFLICT`, fără a doua versiune.

## Respingeri închise

| Motiv | Când |
| --- | --- |
| `STORE_DISPOSED` | store-ul a fost eliberat |
| `VERSION_ID_DUPLICATE` | `versionId` există deja |
| `PARENT_NOT_FOUND` | părintele nu există în store |
| `PARENT_FOREIGN` | părintele aparține altui `profileId` |
| `PARENT_SELF` | `versionId === parentVersionId` |
| `ENGINE_VERSION_MISMATCH` | delta nu declară exact `engineVersion`-ul store-ului |
| `DELTA_VERSION_MISMATCH` | delta nu declară `versionId`-ul copilului |
| `DELTA_BASE_MISMATCH` | delta nu declară exact părintele cerut |
| `DELTA_INVALID` | 102 a respins delta; `deltaCodes` păstrează motivele 102 |
| `DELTA_KEY_NOT_IN_BASE` | delta schimbă o cheie absentă din părinte |
| `INTERVENTION_CONFLICT` | același segment cu alt payload |
| `PROVENANCE_LIMIT` | listele de proveniență ar depăși limita |
| `HISTORY_LIMIT` | limita globală sau pe profil ar fi depășită |
| `INTERVENTION_LIMIT` | limita de intervenții ar fi depășită |

Erorile structurale ale cererii (obiect care nu e plain data, câmpuri necunoscute, parametri
necunoscuți) aruncă `ContractValidationError`, ca restul contractelor. Problemele de domeniu
(părinte, engine, delta, limite, ciclu de viață) sunt întotdeauna rezultate `REJECTED`.

## Limite, proprietate și ciclu de viață

Istoricul este mărginit: implicit 256 de versiuni total, 128 pe profil și 512 intervenții, cu
optiuni validate între 1 și plafoanele configurate. Depășirea produce `HISTORY_LIMIT` sau
`INTERVENTION_LIMIT`; istoricul nu crește tacit și nu evacuează părinți. Fiecare versiune are un
singur `profileId`, iar părintele trebuie să aibă același `profileId`; astfel Academie și Haos nu
pot amesteca lanțuri.

`clear()` golește versiunile și intervențiile, păstrează store-ul utilizabil și incrementează
`clears`. `dispose()` golește tot, setează `disposed`, incrementează `disposes` o singură dată și
respinge mutațiile ulterioare cu `STORE_DISPOSED`; citirile întorc `null`/liste goale, iar
`stats()` rămâne disponibil. Contoarele `deduplicated`, `rejected` și `historyLimitRejections`
sunt cumulative.

## Integrare și limitări

Store-ul nu publică profiluri sau delta, nu emite `PROFILE_ACTIVATE`, nu scrie `implemented` și nu
marchează valori `LEARNED`; `PROFILE_STORE_POLICY` documentează aceste absențe. Nu calculează
estimări, nu decide dacă un delta trebuie aplicat și nu are worker, persistență, `learningEpoch`
sau propagare la tick — acestea rămân în 102/103/110/127/205. Restaurarea, importul și profilul nou care consumă acest store sunt orchestrate în [profile-restore](profile-restore.md). Din cauza direcției de dependențe
(`learning → profiles`), `src/profiles` nu poate importa validatorul 102 fără un ciclu de module;
de aceea validatorul este un port obligatoriu, iar `createCandidateProfileStore` este legarea
canonică. Un consumator care injectează alt validator este responsabil de contractul numeric;
store-ul reverifică totuși cheia, unitatea, intervalul și prezența în bază.

Verificare: `node --import ./scripts/register-typescript.mjs --test tests/profiles/profile-store.test.ts`
plus `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`,
`npm run check:parameter-catalog` și `npm test`. Dovezile sunt în
[Evidence/109-profile-store](Evidence/109-profile-store/README.md).
