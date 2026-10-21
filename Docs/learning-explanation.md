# Explicația modificărilor și „no change” — PBI 104

Contractul pur este `src/ui/learning-explanation-format.ts` (`104-learning-explanation-v1`),
adaptorul DOM este `src/ui/learning-explanation.ts`, iar compunerea cu rezultatele reale 103 este
`src/app/learning-explanation.ts`. Modulul explică fiecare delta acceptat prin dovezile care l-au
susținut și explică lipsa unei schimbări fără să inventeze o versiune. Nu învață, nu publică, nu
activează `estimable`, nu scrie în store și nu mută profilul.

## Snapshot

`LearningExplanationSnapshot` este strict și înghețat:

| Câmp | Semnificație |
| --- | --- |
| `schemaVersion` / `units` | `1` / `SI`; orice altă valoare este respinsă |
| `sessionId` / `worldEpoch` | identitatea reală a sesiunii și a lumii |
| `tick` | tick-ul finit și nenegativ la care hostul a observat rezultatul |
| `segmentId`, `jobKey`, `generationKey` | legarea de segment și de jobul 103 (`job:104:<segment>:<order>`, `gen:104:<profile>:<epoch>:<base>`) |
| `profileId`, `learningEpoch`, `mode`, `order` | identitatea generației și ordinea intervenției |
| `status` | `CHANGED`, `NO_CHANGE`, `INSUFFICIENT_EVIDENCE`, `REJECTED` sau `ERROR` |
| `versionId` | versiunea reală a compunerii 103, sau `null` |
| `changes` | rândurile schimbării, ordonate după cheie |
| `noChangeReason` | motivul închis al unei non-schimbări sau codul real 103 al unei erori |
| `missingContexts` | dovezile/contextele concrete lipsă, ca text mărginit |
| `detail` | detaliul real 103 pentru `ERROR`/`REJECTED`, altfel `null` |
| `summary` / `signature` | textul și semnătura deterministe, recalculate de parser |

`createLearningExplanationSnapshot(frame)` este singurul producător comod: calculează `summary` și
`signature`, apoi le validează. `parseLearningExplanationSnapshot(value, learningKeys?)` respinge
câmpurile în plus/lipsă, cheile duplicate sau neordonate, `tick` nefinit, identitățile peste limită
și orice text care nu corespunde contractului.

## Reguli închise

| Stare | Cerințe |
| --- | --- |
| `CHANGED` | cel puțin o schimbare, `versionId` real, fără motiv de non-schimbare, fără detail |
| `NO_CHANGE` | zero schimbări, `versionId: null`, motiv din `NO_NEW_EVIDENCE`, `WEAK_EVIDENCE`, `BELOW_THRESHOLD`, `UNCHANGED_ESTIMATE`; alt motiv decât `UNCHANGED_ESTIMATE` cere cel puțin un context lipsă |
| `INSUFFICIENT_EVIDENCE` | zero schimbări, `versionId: null`, motiv închis și cel puțin un context lipsă concret |
| `REJECTED` / `ERROR` | zero schimbări, `versionId: null`, motiv real (token majuscul, niciodată `PUBLISHED`/`SUCCESS`/`LEARNED`) și detail opțional real |

O schimbare cere `evidenceCount > 0` (episoade efective 100, nu cadre sau eșantioane), cel puțin un
context real și `delta = next - previous`. `confidence` este exact una dintre stările 100:
`UNOBSERVED`, `WEAK`, `ZERO`, `OBSERVED`; `WEAK` cere `quality: 0` și `uncertainty: HIGH`, iar `ZERO`
cere `next === 0`. Un zero real este o valoare validă, niciodată tratat ca „neobservat”. `UNOBSERVED`
nu poate apărea pe o schimbare, pentru că o schimbare fără dovezi este respinsă de parser.

Cheile sunt unice, ordonate lexicografic și, când apelantul furnizează setul celor 24 de ținte M,
orice cheie R/`extension` este respinsă ca schimbare învățată.

## Proiecția

`projectLearningExplanation(snapshot)` întoarce rânduri stabile per cheie cu valoarea anterioară și
nouă, delta cu unitate (`-0.3 s`), numărul efectiv de episoade, contextele, calitatea, incertitudinea,
starea de încredere, segmentele sursă și motivul. Textul fără versiune spune exact
„Nicio versiune nouă — dovezile nu justifică o schimbare” și enumeră dovezile/contextele lipsă.
Pentru `ERROR`/`REJECTED` apare motivul și detaliul real plus „Nicio versiune nouă”; textul nu
conține niciodată „Profil publicat”.

## Compunerea cu 103

```ts
import { readLearningExplanation, learningExplanationCurrentJob } from './app';

const snapshot = readLearningExplanation(
  [
    { job, outcome },
    { job: secondJob, outcome: secondOutcome },
  ],
  { tick: frame.tick, current: learningExplanationCurrentJob(currentJob) },
);
```

- `composed` cu `value !== baseValue` → `CHANGED`, cu `profileVersionId` real al compunerii și
  dovezile/încrederea evaluate din `evidence`, `episodes` și `candidate` ale aceluiași job.
- `composed` cu valori egale → `NO_CHANGE`, `versionId: null`; motivul derivă din starea reală:
  `UNOBSERVED` → `NO_NEW_EVIDENCE`, `WEAK` → `WEAK_EVIDENCE`, calitate sub 0,6 → `BELOW_THRESHOLD`,
  altfel `UNCHANGED_ESTIMATE`.
- `error` → `ERROR`; `rejected`/`invalidated`/`cancelled` → `REJECTED`, cu motivul/detaliul real 103.
- O schimbare compusă fără dovezi efective sau fără context nu este afișată ca schimbare: cadrul
  devine atomic `INSUFFICIENT_EVIDENCE`, cu `missingContexts` explicit (inclusiv `CONTEXT_MISSING`).
- Mai multe rezultate din aceeași generație se agregă pe cheie, ordonate după cheie; versiunea
  afișată este a compunerii din capul epocii (cea mai mare `order`). Un singur job eșuat face tot
  cadrul eșuat, fără succes parțial.
- Un job târziu sau străin (alt segment/job/epoch/sesiune/lume/generație) produce `ERROR` cu motivul
  închis `STALE_JOB`; nu înlocuiește niciodată rezultatul curent.
- Cheile din afara celor 24 de ținte M sunt refuzate explicit cu
  `Learning explanation job key is not a learning target`.

Funcția este pură: nu publică, nu mută profilul, nu scrie store-ul și nu rulează estimatorul.
Notificările tranzitorii rămân ale 079.

## Panoul

`createLearningExplanationPanel(host, options?)` construiește o singură `section[aria-label]`, un
header cu job/segment/profil/epoch și un badge de stare, o listă `dl` cu legarea, linia versiunii,
rezumatul `aria-live="polite"`, blocul de non-schimbare, lista contextelor lipsă, detaliul de eroare
și un rând `li > dl` per cheie. `update(snapshot, nowMs)` validează cadrul, scrie doar textul
schimbat, plafonează scrierile la 10 Hz (o schimbare de stare/versiune/job ocolește plafonul), nu
scrie nimic pentru un cadru identic și nu atinge DOM-ul pentru un cadru malformat sau învechit.
`getStats()` raportează `writes`, `updates`, `skipped`, `rejected`, `stale`, `rows`, `elements` și
`keyListeners: 0`; `dispose()` este idempotent. Panoul nu are controale și nici listener global de
tastatură.

## Verificare

`tests/ui/learning-explanation.test.ts` acoperă cele 20 de teste: schimbare reală, non-schimbare fără
versiune, parserul care respinge o non-schimbare cu versiune sau schimbare, zero real, agregare
multi-cheie deterministă, context lipsă explicit, schimbare cu zero dovezi respinsă, dovezi slabe,
eroare/respingere/anulare, job târziu/străin, cheie R, rânduri stabile, plafon 10 Hz cu bypass, cadru
identic fără scriere, cadru malformat/învechit fără DOM, valori neinventate, dispose și raportul comis.
`npm run learning:explanation` scrie raportul determinist cu 7 scenarii în
[Evidence/104-learning-explanation](Evidence/104-learning-explanation/README.md).

## Limitări

- Fără captură de browser, FPS, GPU sau măsurătoare hardware: adaptorul este verificat pe un DOM
  determinist.
- Explicația nu calculează estimări, nu decide publicarea și nu înlocuiește 100/101/102/103.
- Contextul provine exclusiv din read model-ul 093 al jobului; un breakdown gol este raportat ca
  context lipsă, nu completat din catalog.
- Un cadru agregat afișează versiunea capului epocii; istoricul versiunilor rămâne al 078/109.
- Publicarea și propagarea rămân ale 110/112; 104 nu emite `LEARNED` și nu modifică flagurile 092.
