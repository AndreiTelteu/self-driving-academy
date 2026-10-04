# Identificatori și random determinist — PBI 006

API public pur în `src/sessions/index.ts`. Nu creează entități, nu execută gameplay/scheduler și nu consumă un generator global. Nici ID-urile, nici eșantioanele nu depind de clock sau `Math.random`.

## Identitatea v1

`createStableId(kind, namespace, keyParts)` produce `id-v1:` urmat de componentele kind, namespace și cheile în ordine. Fiecare componentă este `length:value`, unde length este numărul zecimal de code units UTF-16. Exemplu: `createStableId('vehicle', 'city:one', ['taxi-7', '🚕'])` produce `id-v1:7:vehicle8:city:one6:taxi-72:🚕`.

Encodingul este injectiv pentru tuplele acceptate: delimitatorii din valori nu creează coliziuni. Păstrează Unicode exact, inclusiv non-BMP, code units surrogate izolate și forme canonice distincte. Nu normalizează, nu elimină whitespace și nu face conversie implicită. Ordinea componentelor contează. Kind/namespace diferențiază tipuri și lumi; namespace poate reprezenta un scenariu sau o sesiune/generație stabilă. Consumatorul alege chei semantice persistente, nu poziții în array sau numărul global de evenimente. Repetarea aceleiași tuple înseamnă aceeași identitate, deci apelantul trebuie să distingă aparițiile logice diferite (de exemplu stopLineId și numărul apropierii pentru acel vehicul).

Fiecare componentă are 1–256 code units și nu poate fi numai whitespace. Lista are 1–16 chei; array-uri sparse, getters sau câmpuri suplimentare sunt respinse. IDs au maximum 4686 code units (prefix 6 + 18 componente de maximum 260 + kind/namespace incluse în cele 18). Exportul include `IDENTITY_VERSION=1` și limitele; parsarea unui ID importat și alocarea/unicitatea cheilor în lume aparțin consumatorului. Formatul este o identitate opacă pentru contractele existente, nu un UUID și nu un token secret.

## Seed și adresarea eșantioanelor v1

`RandomSeed` este uint32 în [0, 4294967295], verificat runtime. `-0` este echivalent cu `0`. Derivarea are domenii separate:

```typescript
const scenarioSeed = deriveScenarioSeed(rootSeed, scenarioId);
const vehicleSeed = deriveVehicleSeed(scenarioSeed, vehicleId);
const opportunitySeed = deriveOpportunitySeed(vehicleSeed, opportunityKey);
const decision = randomUnit(opportunitySeed, 'violate-stop', 0);
const reaction = randomUnit(opportunitySeed, 'reaction-delay', 0);
```

Scenariul, vehiculul și cheia oportunității sunt stringuri exacte, nenule, nu numai whitespace, maximum 8192 code units. Pentru același snapshot scenariu/vehicul/opportunity se păstrează cheile și rootSeed. Schimbarea profilului nu intră automat în seed: comparațiile între profiluri pot folosi aceleași eșantioane. Cheia unei oportunități trebuie stabilită semantic de modulul ei; un index global de evenimente ar încălca acest contract.

`randomUint32(seed, sampleKey, sampleIndex=0)` adresează un eșantion explicit. `sampleIndex` este întreg sigur nenegativ, maximum Number.MAX_SAFE_INTEGER; nu există wraparound sau contor intern. Repetarea unui index/purpose reproduce aceeași valoare; scopuri diferite folosesc sampleKey distinct. Schimbarea ordinii apelurilor, inserarea altor evenimente sau eșantionarea altui vehicul nu consumă și nu schimbă aceste valori. `randomUnit` împarte uint32 la 2^32 și produce o grilă de 2^32 valori în [0,1), fără endpoint 1.

Hashul folosește encodingul length-prefixed pentru `[version, domain, decimalSeed, ...keys]`. Indexul este și el un string zecimal. FNV-1a începe la 0x811c9dc5, consumă două bytes UTF-16LE per code unit și multiplică cu 0x01000193 prin Math.imul. Avalanche final: xor >>>16 și imul 0x85ebca6b; xor >>>13 și imul 0xc2b2ae35; xor >>>16 și conversie unsigned. Domeniile sunt `scenario`, `vehicle`, `opportunity`, `sample`; `RANDOM_VERSION=1`. Algoritmul este non-criptografic și poate avea coliziuni 32bit; seed-uri/chei diferite nu garantează matematic rezultate diferite. Nu este adecvat pentru securitate sau criptografie. Compatibilitatea secvențelor cere aceeași versiune; un algoritm/encoding nou trebuie versionat explicit.

Nu există stare mutabilă RNG de serializat. Un checkpoint poate păstra versiunea, seed/rootSeed, cheile și următorul index ales de consumator, apoi valida aceste valori înainte de reluare. Modulul nu implementează schema checkpointului sau persistarea. Garantăm reproductibilitatea acestei funcții numerice în JS, nu determinismul întregii fizici între GPU/browser/platforme.

## Dovezi

`tests/identity/identity-random.test.ts` fixează golden vectors și verifică seed-uri/domenii diferite, delimitatori/Unicode, inserarea și reordonarea evenimentelor, scopuri/indexuri independente, reluare JSON, limitele [0,1) și respingerea intrărilor invalide fără getters/coercion. Valorile golden pentru root 12345 și cheile `city:one` → `taxi-7` → `STOP:main:3` sunt 3054818983 → 1945142871 → 2770425298; primele patru uint32 pentru `decision` sunt 2651730780, 2303379157, 3315660770, 3021006712.
