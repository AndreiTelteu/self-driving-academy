# Istoricul profilului și restaurarea 078

Status: implementare și validare funcțională locală. `src/ui/profile-history-format.ts` deține
contractul, parserul strict, derivarea previzualizării și proiecția; `src/ui/profile-history.ts` este
adaptorul DOM; `src/app/profile-history.ts` compune istoricul real 109, planifică restaurarea și leagă
porturile hostului. Modulul nu creează, nu editează, nu publică și nu activează nicio versiune:
109 deține stocarea, 110 publicarea, iar 114 semantica de activare/restaurare. Aici se afișează și se
cere explicit, nimic mai mult.

## Ce afișează

Panoul are un antet cu ID-ul profilului și numărul de versiuni, identitatea versiunii curente și a
celei selectate, un `<ul role="listbox">` cu câte un buton nativ pentru fiecare `versionId`, o secțiune
de previzualizare a modificărilor și o secțiune de restaurare cu buton explicit și confirmare vizibilă.
Fiecare rând arată versiunea, starea (`Bază`, `Derivat`, `Curent`, `Selectat`, `Incompatibil`), motorul
și numărul de segmente sursă; checksum-ul, data și descrierea completă sunt în `aria-label`.

Fără nicio versiune, panoul afișează explicit „Istoric gol” și nu inventează niciun rând. Lista este
ascunsă, restaurarea este blocată cu `MISSING_VERSION`, iar butonul este `disabled`.

## Identitate și imuabilitate

- `versionId` este singura identitate de rând. Schimbarea selecției, a versiunii curente sau a
  steagurilor nu creează, nu renumerotează și nu mută noduri; nodul este refolosit cât timp
  `versionId` există.
- Intrările sunt instantanee înghețate ale versiunilor deja stocate. Nu există nicio cale de editare
  în contract, iar un `versionId` duplicat este respins de parser înainte de orice scriere în DOM.
- Previzualizarea compară două instantanee și nu scrie înapoi în niciunul. Selectarea și restaurarea
  nu modifică parametrii, checksum-ul sau istoricul store-ului.
- Ordinea este deterministă: întâi `depth` crescător (bază → vârf), apoi `versionId` ca departajare
  pentru versiunile de la aceeași adâncime. Parserul respinge o listă nesortată.
- Un părinte trebuie să existe la `depth - 1`, o versiune de bază are `parentVersionId: null`, iar o
  versiune nu poate fi propriul părinte.

## Selectare versus restaurare

Selectarea nu restaurează. Un clic pe un rând emite doar portul `select(versionId)`; hostul răspunde
cu un cadru nou, iar panoul afișează previzualizarea. Restaurarea cere două acțiuni explicite:

1. butonul „Restaurează” este activ numai când starea este `AVAILABLE`; primul clic deschide starea
   vizibilă de confirmare și nu emite nimic;
2. butonul „Confirmă restaurarea” emite o singură intenție `restore(versionId)`.

Un cadru nou care schimbă selecția, versiunea curentă sau starea restaurării resetează confirmarea;
un cadru identic o păstrează. Portul `restore` este singura cale de ieșire către host: adaptorul nu
citește și nu scrie store-ul, nu publică și nu activează. Motivul unui refuz al hostului este afișat
verbatim, fără a fi inventat sau reformulat.

## Previzualizarea

`ProfileHistoryPreview` are `fromVersionId` (întotdeauna versiunea curentă), `toVersionId`
(întotdeauna selecția) și o listă de modificări `{ key, previous, next, unit, source, reason }`,
sortată după cheie. Lista există exact când ambele versiuni sunt în istoric și diferă; altfel
secțiunea explică de ce lipsește (nicio selecție, aceeași versiune, versiune absentă).

- O cheie prezentă într-o singură versiune are `null` pe partea lipsă; ambele părți `null` și valorile
  egale sunt respinse.
- `source: 'DELTA'` apare numai când delta stocată a versiunii țintă descrie exact tranziția
  (`previousValue`/`newValue` egale cu valorile comparate); atunci `reason` este motivul stocat.
  Altfel `source: 'SNAPSHOT'` și motivul este textul explicit „Valoare diferită între versiuni”.
  Parserul respinge o modificare `SNAPSHOT` care inventează alt motiv.
- Cheile R (`extension`) sunt rezervate și nu sunt învățabile în V1. Compunerea reală exclude cheile R
  din listă, iar parserul respinge un cadru care le-ar include. Regula este aceeași pentru toate
  versiunile, deci o cheie R nu apare niciodată ca modificare învățabilă, chiar dacă recordul conține
  un număr pentru ea.
- Un zero real rămâne vizibil: `0 m/s → 0.5 m/s`.

## Starea restaurării

| `action` | `reason` | Când |
| --- | --- | --- |
| `NONE` | `NO_SELECTION` | istoricul are versiuni, dar nu există selecție |
| `AVAILABLE` | `null` | selecția există, diferă de curent, este compatibilă și unica |
| `BLOCKED` | `MISSING_VERSION` | istoric gol, versiune curentă lipsă sau selecție absentă din store |
| `BLOCKED` | `SAME_VERSION` | selecția este chiar versiunea curentă |
| `BLOCKED` | `PROFILE_MISMATCH` | selecția aparține altui profil |
| `BLOCKED` | `ENGINE_MISMATCH` | versiunea curentă sau cea selectată nu aparține motorului hostului |
| `BLOCKED` | `DUPLICATE_VERSION_ID` | un store corupt/adaptat raportează ID-uri duplicate |

`explicit: true` și `confirmationRequired: true` sunt obligatorii în fiecare cadru. Orice altă
combinație este respinsă de parser. `DUPLICATE_VERSION_ID` este un motiv închis al planificatorului
pentru un store care ar raporta duplicate; un cadru valid nu poate conține duplicate, deci nu poate
ajunge la el prin compunerea normală.

## API

```ts
import { createProfileHistoryPanel, PROFILE_HISTORY_VERSION } from './ui';
import {
  createProfileHistoryPorts,
  planProfileRestore,
  readProfileHistorySnapshot,
} from './app';

const panel = createProfileHistoryPanel(host, {
  reservedKeys: PROFILE_HISTORY_RESERVED_KEYS,
  select: (versionId) => ports.select(versionId),
  restore: (versionId) => ports.restore(versionId),
});

const snapshot = readProfileHistorySnapshot(
  { store },                                   // 109 real
  { tick, profileId, selectedVersionId },      // opțional currentVersionId/engineVersion
);
panel.update(snapshot, nowMs);                 // cel mult 10 Hz
panel.open();
panel.close();
panel.getStats();                              // rows, created, writes, skipped, updates, listeners, …
panel.dispose();                               // idempotent
```

`readProfileHistorySnapshot` citește `store.listVersions(profileId)`, `store.getHistory(profileId)`
și `store.getVersion(...)`. Versiunea curentă este vârful istoricului sau `currentVersionId`-ul
explicit al hostului; o versiune curentă inexistentă sau străină este o eroare închisă, nu o valoare
inventată. `PROFILE_HISTORY_LOCAL_CONTEXT` este scopul local documentat până la cablarea sesiunii.

`planProfileRestore({ store, profileId, currentVersionId, selectedVersionId, engineVersion })`
verifică în ordine: selecția există, aparține profilului, diferă de curent, ambele versiuni aparțin
motorului hostului și istoricul nu are `versionId` duplicat. Întoarce doar `AVAILABLE` sau un motiv
închis `BLOCKED`; nu mută și nu scrie nimic.

`createProfileHistoryPorts({ store, restore, engineVersion?, currentVersionId?, profileId? })`
furnizează `select(versionId): boolean` (adevărat numai dacă versiunea există) și
`restore(versionId): { accepted, reason }`. `restore` apelează handlerul hostului numai după un plan
`AVAILABLE` și propagă rezultatul hostului; nu creează nicio versiune.

## Formatare și scriere

| Valoare | Regulă | Exemplu |
| --- | --- | --- |
| Număr | maximum trei zecimale, fără dependență de locale | `0.5` → `0.5`, `0` → `0` |
| Unitate | unitatea canonică din catalogul 092, cu etichete lizibile | `m/s`, `probabilitate` |
| Modificare | valoare anterioară, săgeată, valoare nouă și unitate | `0 m/s → 0.5 m/s` |
| Versiune | `versionId` și starea derivată din steaguri | `v2 · Derivat · Nivel 1` |

Scrierile sunt plafonate la `10 Hz`. Schimbarea selecției, a versiunii curente sau a stării
restaurării ocolește plafonul; un cadru identic nu scrie nimic, chiar dacă tick-ul a avansat. Un cadru
malformat, în urmă sau cu ceas descrescător este respins înainte de orice atingere a DOM-ului.

## Accesibilitate

- `section[aria-label]` descrie profilul, numărul de versiuni, versiunea curentă și disponibilitatea
  restaurării; `aria-describedby` duce la regulile complete.
- Lista este `role="listbox"`, fiecare rând este un `<button role="option">` nativ, cu
  `aria-selected`, deci tastatura funcționează fără listeners globali.
- Starea și incompatibilitatea sunt purtate de text și de `data-*`, nu doar de culoare.
- Rezumatul este `role="status"` cu `aria-live="polite"`; confirmarea schimbă textul statusului.
- Panoul nu instalează niciun listener de tastatură globală și nu are controale care ar putea
  modifica un profil în afara porturilor injectate.

## Limite

| Limită | Valoare |
| --- | ---: |
| Versiuni per istoric | 128 |
| Modificări de previzualizare | 80 |
| Segmente sursă per versiune | 64 |
| Frecvență de scriere | 10 Hz |
| Code units per identitate | 512 |
| Code units per motiv | 240 |
| Zecimale de afișare | 3 |
| Proiecții reținute | 1 |

## Verificare

`tests/ui/profile-history.test.ts` (19 teste) acoperă: parserul strict și cadrele contradictorii,
istoricul gol, ordinea deterministă și departajarea după `versionId`, previzualizarea derivată din
două instantanee, blocarea aceleiași versiuni, selecția absentă, motorul incompatibil, profilul străin,
imuabilitatea identității, restaurarea explicită în doi pași, clicul care nu restaurează, nodurile
stabile, plafonul de 10 Hz cu ocolire, cadrul identic, cadrele respinse, ciclul de viață, cheia R și
planificatorul/porturile.

```powershell
npm run profile:history
npm run profile:history -- --check
```

Runnerul scrie [report.json](Evidence/078-profile-history/report.json) și
[report.md](Evidence/078-profile-history/report.md): 7 scenarii deterministe (istoric gol, lanț
multi-versiune, previzualizare delta, cheie rezervată, motor incompatibil, restaurare confirmată,
60 de cadre plafonate) și 58 de verificări, inclusiv DOM-ul serializat. `npm test` include comparația
cu transcriptul comis.

## Ce NU este

- Nu este 109: nu creează, nu derivează și nu validează numeric o versiune sau un delta.
- Nu este 110/114: nu publică, nu activează și nu restaurează efectiv; doar cere explicit.
- Nu este 077: nu afișează toate cele 80 de valori ale unei versiuni și nu produce valori.
- Nu măsoară FPS, GPU sau hardware; raportul este un transcript determinist, nu o probă de
  performanță.
- Nu este cablat în hostul live: contextul de sesiune poate fi injectat explicit, iar până atunci
  compunerea folosește `PROFILE_HISTORY_LOCAL_CONTEXT` ca scop local documentat.
