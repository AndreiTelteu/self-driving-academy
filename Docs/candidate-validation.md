# Validarea numerică a unui delta — PBI 102

`src/learning/candidate-validation.ts` este poarta numerică dintre candidații 094–101 și orice
consumator care ar putea aplica un delta. Modulul este exportat prin `src/learning/index.ts` și
întoarce fie un delta acceptat și înghețat, fie o listă închisă de respingeri. Nu publică profiluri
sau delta, nu scrie `implemented`/`estimable` în registrul 092 și nu emite `LEARNED`.

## API

- `validateCandidateDelta(input, expectations?)` — validează atomic un delta candidat.
  `input` conține `profileVersionId`, opțional `parentVersionId`, `engineVersion`, `schemaVersion`,
  `units` și lista `values`; fiecare valoare are `key`, `value` și `unit`.
  `expectations` poate fixa `baseVersionId` și `engineVersion` așteptate.
- `isCandidateValidationAccepted(result)` — type guard pentru ramura acceptată.
- `CANDIDATE_LEARNING_KEYS` — cele 24 chei M (`initial_learning_target`), înghețate.
- `candidateRejectionCodes` / `CandidateRejectionCode` — vocabularul închis de motive.
- `CANDIDATE_VALIDATION_POLICY` — constanta care documentează absența unui gate comportamental.
- `CANDIDATE_VALIDATION_VERSION` — `102-candidate-validation-v1`.

Rezultatul are două ramuri exclusive:

| Ramură | `status` | `delta` | `rejections` | `acceptedKeyCount` |
| --- | --- | --- | --- | --- |
| acceptat | `ACCEPTED` | delta înghețat | `[]` | numărul de valori |
| respins | `REJECTED` | `null` | toate problemele găsite | `0` |

Nu există o a treia ramură și nu există un delta parțial: dacă orice valoare sau orice verificare de
compatibilitate eșuează, `delta` este `null`, iar valorile individual valide nu sunt expuse.
Ambele ramuri au `published: false`, `learned: false` și `behaviour: 'NOT_EVALUATED'`.

## Verificările

O valoare este acceptată numai dacă trece toate verificările:

1. **Cheie cunoscută** — cheia există în catalogul 092; altfel `KEY_UNKNOWN`.
2. **Etapa de învățare** — cheia aparține celor 24 de ținte `initial_learning_target`. O cheie
   `extension` (R/1) este refuzată explicit cu `KEY_EXTENSION_STAGE`, nu ignorată și nu acceptată
   tacit.
3. **Unitate** — unitatea trimisă trebuie să fie exact unitatea canonică 092 a cheii; altfel
   `UNIT_MISMATCH`.
4. **Număr finit** — `NaN`, `±Infinity`, șiruri numerice și alte tipuri sunt `VALUE_NOT_FINITE`.
5. **Interval** — valoarea trebuie să fie în `[min, max]`-ul inclusiv din 092; altfel
   `VALUE_OUT_OF_RANGE`. Limitele exacte sunt acceptate.
6. **Unicitate** — aceeași cheie nu poate apărea de două ori în delta (`DUPLICATE_KEY`), iar un
   delta fără valori este `DELTA_EMPTY`.

Valorile sunt păstrate exact cum au fost trimise: nu există rotunjire, plafonare tacită sau
normalizare. `min`/`max`/`unit`/`implemented` sunt copiate din registru doar în ramura acceptată,
ca metadate; `implemented` nu este un gate aici și nu este modificat.

## Compatibilitate

Verificările de compatibilitate resping cu motiv explicit, înaintea oricărei aplicări:

| Motiv | Când |
| --- | --- |
| `PROFILE_VERSION_MISSING` | delta nu declară un `profileVersionId` nevid |
| `PROFILE_SCHEMA_MISMATCH` | `schemaVersion` ≠ 1, `units` ≠ `SI`, sau `parentVersionId`/`engineVersion` au tip greșit |
| `PROFILE_VERSION_SELF_PARENT` | delta se declară propriul părinte |
| `BASE_VERSION_MISMATCH` | `expectations.baseVersionId` nu coincide cu `parentVersionId` |
| `ENGINE_VERSION_MISMATCH` | `expectations.engineVersion` nu coincide cu `engineVersion` din delta |

Un input structural invalid (delta care nu e obiect, `values` care nu e array) aruncă eroare, ca în
restul modulelor de contract; problemele de valoare sunt întotdeauna respingeri închise, nu excepții.

## Stil riscant, nu invalid

Validarea este exclusiv numerică. Coliziunile posibile, încălcările de trafic și stilul agresiv nu
sunt motive de respingere: un delta cu `speed_delta_urban = 15` (limita superioară), un `curve_lateral_accel`
aproape de maxim și un `following_time_headway` de 0,2 s este acceptat dacă numerele, unitățile,
intervalele și etapa sunt valide. `CANDIDATE_VALIDATION_POLICY.behaviouralGate` este `NONE`, iar
rezultatul raportează `behaviour: 'NOT_EVALUATED'`; consecințele economice și de siguranță rămân în
afara acestui contract, conform [modulului 10](10-invatarea-stilului.md).

## Atomicitate

Toate problemele sunt colectate într-o singură trecere, în ordinea: compatibilitate, apoi valorile în
ordinea din listă. Un apel cu `[valid, NaN, cheie R, cheie necunoscută]` întoarce `REJECTED`,
`delta: null`, `acceptedKeyCount: 0` și `rejectedValueCount: 3`. Astfel apelantul nu poate aplica
accidental jumătatea validă și nu poate ascunde o respingere. Lista de respingeri, valorile acceptate
și delta sunt înghețate.

## Integrare și limitări

Modulul citește registrul 092 prin `parameterDefinitions` și nu îl scrie. Nu are worker, persistență,
publicare de profil, activare `estimable`, emitere `LEARNED`, checksum, barieră `learningEpoch` sau
propagare la tick. Compatibilitatea cu controllerul rămâne gate-ul de publicare al 092; aici
`implemented` este doar metadată. Validarea nu decide dacă un delta trebuie aplicat și nu calculează
consecințe fizice.

Verificare: `node --import ./scripts/register-typescript.mjs --test tests/learning/candidate-validation.test.ts`
plus `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`,
`npm run check:parameter-catalog` și `npm test`. Dovezile sunt în
[Evidence/102-candidate-validation](Evidence/102-candidate-validation/README.md).
