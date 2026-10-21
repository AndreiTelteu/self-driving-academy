# Legarea UI la profiluri reale — 113

Status: implementare și validare funcțională locală. `src/app/profile-ui-binding.ts`
(`113-profile-ui-binding-v1`) este composition root-ul care citește o singură versiune imuabilă 109
și o proiectează în panoul 077, istoricul 078 și ținta activă 110. Opțional, leagă explicația 104 de
ultimul rezultat 112. Modulul nu creează, nu editează, nu publică, nu activează și nu învață nimic:
109 deține versiunile, 110 publicarea, 112 pipeline-ul, iar 077/078/104 dețin contractele de
prezentare. Aici se compară proiecțiile și se raportează abaterile închise.

## De ce există

077 și 078 pot afișa separat un profil real, dar nimic nu garanta până acum că panoul, istoricul și
ținta activă arată aceeași versiune, aceleași valori și aceleași motive. 113 adaugă această garanție:
fiecare proiecție pornește din același record 109, iar un verificator independent compară rezultatul
cu adevărul capturat. Fără o versiune reală, binding-ul este gol și raportează `MISSING_VERSION`; nu
folosește cadrul ilustrativ 077 și nu inventează un rând.

## API

```ts
import {
  profileUiBindingReport,
  readProfileUiBinding,
  verifyProfileUiConsistency,
} from './app';

const binding = readProfileUiBinding(
  {
    store, // 109 real
    pipeline, // 112 real, opțional
    activation, // 110 real, opțional
    explanation, // 104 real pentru ultimul rezultat, opțional
  },
  { tick, profileId, selectedVersionId, currentVersionId },
);

const consistency = verifyProfileUiConsistency(binding);
const report = profileUiBindingReport(binding);
```

`readProfileUiBinding` citește `store.getVersion`, `store.getHistory` și
`activation.activeProfile()`. Nu scrie store-ul, registrul, pipeline-ul sau flota. `tick` este
tick-ul acceptat de host, nu un ceas de perete.

## Sursa versiunii

Ordinea de rezolvare este explicită:

1. `currentVersionId`, când hostul fixează versiunea;
2. ținta 110 `activation.activeProfile()`, când controller-ul este injectat;
3. vârful istoricului 109 pentru profil.

O versiune fixată inexistentă, străină profilului sau o țintă 110 care nu există în store nu este
înlocuită tacit cu altă versiune: binding-ul devine gol cu `MISSING_VERSION`. Selecția implicită
pentru istoric este părintele versiunii afișate, astfel încât previzualizarea să compare exact
tranziția reală părinte→copil; hostul poate selecta altă versiune existentă.

## Valori, rezervat și neobservat

| Stare | Panel 077 | Istoric 078 | Regulă |
| --- | --- | --- | --- |
| `OBSERVED` | valoarea reală, inclusiv `0` | aceeași valoare | cheia există în `ProfileVersion.parameters` |
| `UNOBSERVED` | `null` | `null` | cheia lipsește din record; valoarea implicită din catalog nu devine valoare curentă |
| `RESERVED` | `null`, `RESERVED_V1` | `null` | cheie R/`extension`, chiar dacă recordul conține un număr |

Un zero real rămâne `OBSERVED`/`0` în ambele proiecții și apare în delta ca `0.5 → 0`, niciodată ca
lipsă. O cheie R nu apare niciodată ca modificare învățabilă în delta 077 sau în previzualizarea
078. Cheile R și cheile neobservate rămân distincte în istoric: `RESERVED` versus `UNOBSERVED`, cu
`value: null` în ambele cazuri.

## Evidence absent, nu inventat

Un `ProfileVersion` 109 gol nu păstrează proveniența și dovezile per cheie. Binding-ul nu le
inventează:

- fiecare rând observat are `panelEvidenceCount: 0`, `panelUncertainty: 0` și
  `evidenceReason: 'NO_EVIDENCE_RECORD'`;
- sursa 109 este marcată `hasEvidence: false`;
- nu apare `PROFILE_VALUE_LEARNED`, nu apare `quality` inventat și nu se copiază dovezi din alt job;
- un număr de dovezi sau o incertitudine mai mare de zero pe un record fără dovezi este raportat ca
  abatere, nu afișat ca sprijin real.

Deoarece 109 nu păstrează proveniența per cheie, rândurile 077 primesc sursa închisă
`PROFILE_VALUE_BASE`; aceasta descrie recordul imuabil, nu pretinde că valoarea ar fi fost învățată.
Dacă un job 104 este disponibil, codurile lui `EVIDENCE_APPLIED`/`ZERO_OBSERVED` apar separat pe rând,
fără a transforma sursa 077 în `LEARNED`.

## Delta și previzualizarea

- Delta panoului este delta 109 a versiunii afișate: `baseVersionId` este exact părintele, valorile
  `previous`/`next` sunt cele două valori imuabile, iar motivul este motivul stocat (sau textul
  explicit „Motiv nespecificat”).
- Previzualizarea 078 compară versiunea curentă cu selecția; când selecția este părintele, direcția
  este copil→părinte și fiecare valoare este verificată față de cele două recorduri. Un zero real
  rămâne vizibil în ambele direcții.
- O cheie R nu produce rând de delta. O valoare care nu există într-o versiune are `null` pe partea
  lipsă, niciodată `0`.

## Explicația 104

Când hostul furnizează un `LearningExplanationSnapshot` produs de 104 pentru ultimul rezultat 112,
binding-ul îl atașează și păstrează codurile închise:

- `CHANGED`: `versionId` trebuie să fie versiunea reală, cheile schimbării trebuie să coincidă cu
  delta 109, iar codurile `EVIDENCE_APPLIED`/`ZERO_OBSERVED` ajung pe rândurile respective;
- `NO_CHANGE`: `versionId` este `null`, ultimul rezultat 112 este `NO_CHANGE` fără versiune, iar
  motivul închis (`NO_NEW_EVIDENCE`, `WEAK_EVIDENCE`, `BELOW_THRESHOLD`, `UNCHANGED_ESTIMATE`) apare
  pe rândul cheii de compoziție;
- un rezultat `ERROR`/`REJECTED` este acceptat numai dacă aparține ultimului segment 112.

Explicația nu este obligatorie. Fără ea, rândurile schimbate primesc `DELTA_RECORDED`, iar cele
neschimbate `NOT_CHANGED`; binding-ul nu inventează un motiv 104.

## Coduri de abatere

`verifyProfileUiConsistency(binding)` întoarce numai coduri închise și nu repară nimic. `pass` este
`true` numai când lista este goală.

| Cod | Când |
| --- | --- |
| `VERSION_MISMATCH` | panel, istoric, părinte sau selecție nu indică versiunea capturată |
| `PANEL_VALUE_MISMATCH` | valoarea/starea panoului, delta sau suportul nu coincide cu recordul |
| `HISTORY_VALUE_MISMATCH` | previzualizarea nu coincide cu cele două versiuni reale |
| `ACTIVE_TARGET_MISMATCH` | ținta 110 lipsește ori diferă de versiunea afișată |
| `DELTA_BASE_MISMATCH` | baza deltei nu este părintele real sau nu coincide cu previzualizarea părinte |
| `RESERVED_TREATED_AS_OBSERVED` | o cheie R are valoare, sursă, stare observată sau apare în delta |
| `UNOBSERVED_TREATED_AS_ZERO` | o cheie absentă are `0` în loc de `null` |
| `REASON_CODE_MISMATCH` | codul/motivul nu coincide cu starea, delta 109 sau explicația 104 |
| `MISSING_VERSION` | nu există o versiune reală sau snapshot-urile panel/istoric lipsesc |

Fiecare abatere este raportată pe cod și, când are sens, pe cheie în `rowMismatches`. Verificatorul
compară proiecțiile cu `source`, adevărul 109 capturat la citire, deci o valoare modificată în panou
sau în istoric este vizibilă chiar dacă ambele ar fi modificate identic.

## Raport

`profileUiBindingReport(binding)` întoarce un rând per cheie din catalogul 092 (80), cu:

- `versions.panel`, `versions.history`, `versions.active`;
- valoarea și starea panoului, valoarea și starea istoricului;
- delta panoului (`previous`/`next`/motiv) și delta istoricului;
- `reserved`, `observed`, `unobserved`, `reasonCodes`, `mismatches`;
- totaluri pe stări, rânduri cu abateri și `pass`.

Raportul este determinist: nu conține ceas de perete, valori aleatoare, stare de browser sau
măsurători hardware. El este transcrierea comparabilă pentru criteriul „UI și politica raportează
aceeași versiune și aceleași valori”.

## Limite

| Limită | Valoare |
| --- | ---: |
| Chei de catalog | 80 |
| Rânduri de raport | 80 |
| Viziuni reținute | 1 |
| Istoric propriu | 0 |
| Modificări de delta | 80 |
| Explicații atașate | 1 |

## Verificare

`tests/app/profile-ui-binding.test.ts` conține 21 de teste: aceeași versiune în panel/istoric/țintă,
toate cele 24 de chei M, cheie R cu număr în record, cheie neobservată, zero real, delta
părinte→copil, coduri 104 pentru `CHANGED` și `NO_CHANGE`, opt abateri injectate (inclusiv istoric),
lipsa versiunii, dovezi explicite, determinism, imuabilitatea store-ului/flotei și raportul per cheie.

```powershell
npm run profile:ui-binding
npm run profile:ui-binding -- --check
```

Runnerul scrie [report.json](Evidence/113-profile-ui-binding/report.json) și
[report.md](Evidence/113-profile-ui-binding/report.md): 7 scenarii deterministe (versiune curentă,
delta părinte→copil, cheie rezervată, cheie neobservată, zero real, motiv `NO_CHANGE`, abateri
injectate) și 54 de verificări. `npm test` include testele modulului.

## Ce NU este

- Nu este 109: nu creează, nu derivează și nu validează numeric o versiune sau un delta.
- Nu este 110/112: nu publică, nu activează, nu propagă și nu rulează estimatorul.
- Nu este 077/078/104: nu deține contractele de prezentare și nu modifică valorile lor.
- Nu repară automat o abatere și nu ascunde o versiune lipsă în spatele preview-ului ilustrativ.
- Nu inventează dovezi, incertitudine, proveniență per cheie sau motive 104.
- Nu măsoară FPS, GPU sau hardware și nu conține captură de browser; raportul este un transcript
  determinist, nu o probă de performanță.
