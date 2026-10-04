# Registry parametri (PBI092)

`Docs/driving-parameters.json` este sursa canonică. Rulează `node scripts/generate-parameter-catalog.mjs` după editare; `--check` verifică exact sincronizarea. Scriptul serializează determinist și formatează cu configurația proiectului. Fișierul TS derivat rămâne în `src/profiles`, fără import runtime din Docs. Testul de sincronizare este inclus în `npm test`.

Entry point: `src/profiles/index.ts`. `ParameterKey` este uniunea literală generată a celor 80 de chei. `parameterRegistry` este mapul readonly după cheie; `parameterDefinitions` este lista imuabilă, în ordinea catalogului. `getParameterDefinition(key)` respinge chei necunoscute. Definițiile și listele sunt copii înghețate, nu referințe mutabile la datele generate.

`parseParameterCatalog(unknown)` validează schema 1/design_proposal/SI, data calendaristică, câmpurile exacte, 80 chei cunoscute unice, 24 ținte initial_learning_target, texte, unități și numere finite, min ≤ default ≤ max și probabilități în [0,1]. Respinge getters, simboluri, obiecte non-data și array-uri sparse prin cititorii contractelor 005. `implemented` din catalog trebuie să rămână false în acest milestone: o editare a planului nu acordă capabilități runtime.

M (`initial_learning_target`) și R (`extension`) sunt etape planificate. Sunt distincte de `implemented` și `estimable`, ambele false pentru toate cele 80 chei. Nu există controller sau estimator implementat. Activarea viitoare cere schimbare explicită în registry, implementarea/verificarea politicii și, separat, a estimatorului; etapa M singură nu acordă suport.

`validateParameterValue(key, value, unit)` întoarce numărul validat în intervalul inclusiv. Unitățile canonice sunt cele din contractul DrivingProfile. raport→ratio, pondere→weight, probabilitate→probability, s/viraj și s/semafor→s. `sourceUnit` păstrează sensul contextual, fără conversie numerică implicită.

`parsePublishableDrivingProfile(unknown)` este gate-ul concret peste `parseDrivingProfile`: verifică structura/dovezile/proveniența și apoi cheia, unitatea și intervalul fiecărei valori. LEARNED cere implemented **și** estimable; MANUAL_TUNING cere implemented. În starea curentă ambele sunt respinse pentru orice cheie. BASE și IMPORTED pot păstra chei cunoscute rezervate cu valori valide, fără a le declara utilizabile de controller. Dovezile istorice nu schimbă proveniența și nu acordă suport. Cheile necunoscute, numerele nefinite, intervalele și unitățile greșite sunt respinse indiferent de proveniență.

```typescript
import { parsePublishableDrivingProfile } from '../profiles';

const candidate: unknown = JSON.parse(serializedProfile);
const validated = parsePublishableDrivingProfile(candidate);
// Serviciul viitor poate continua verificările de engine/bază/epoch și activarea atomică.
```

Gate-ul produce o copie imuabilă sau aruncă ContractValidationError; nu publică un eveniment și nu schimbă starea lumii. Viitorii writeri trebuie să îl folosească înainte de publicare. Nu implementează estimator, controller, checksum, compatibilitate engine, delta, bariere learningEpoch sau propagare la tick comun. ProfileSnapshot bootstrap rămâne separat. Parserul structural 005 acceptă în continuare chei rezervate pentru roundtrip; acesta nu este un gate de publicare.

Verificare: `node --import ./scripts/register-typescript.mjs --test tests/parameters/registry.test.ts`, `node scripts/generate-parameter-catalog.mjs --check`, `npm run check`, `npm run build`. Testele registry acoperă toate cele 80 chei, capabilități, proveniență, publicare, limite/unități, catalog invalid, imuabilitate și sincronizare. Nu este necesar playtest vizual pentru acest contract pur de date.
