# Panoul profilului 077

Status: implementare și validare funcțională locală. `src/ui/profile-panel-format.ts` deține
contractul, parserul strict, proiecția și textele; `src/ui/profile-panel.ts` este adaptorul DOM;
`src/app/profile-panel.ts` compune un `DrivingProfile` real 109 sau, în lipsa lui, valorile reale din
catalogul 092. Modulul nu învață, nu publică, nu activează și nu modifică niciun profil: 110 rămâne
proprietarul publicării, iar 112 al propagării.

## Ce afișează

Panoul are un antet cu ID-ul profilului, versiunea, versiunea motorului și checksum-ul, un badge
`ILUSTRATIV` sau `PUBLICAT`, un rezumat politicos al stărilor și secțiuni pe categoriile catalogului,
în ordinea catalogului. Fiecare dintre cele 80 de chei are exact un rând cu etichetă, valoare și
unitate, incertitudine, număr de dovezi, sursă și motivul închis al stării. Un `<details>` nativ
conține checksum-ul și numărul de dovezi.

Rândurile rezervate sunt distincte prin text („Rezervat · neînvățabil V1”), prin
`data-status="RESERVED"` și printr-un chenar punctat; culoarea doar întărește textul.

## Stări explicite

| Stare | Când | `value` | Text | Învățabil |
| --- | --- | --- | --- | --- |
| `OBSERVED` | profilul publicat are o valoare pentru cheie | numărul real, inclusiv `0` | „0 m/s”, „2.5 m/s²” | da |
| `UNOBSERVED` | profilul nu are valoare pentru cheie | `null` | „Neobservat” | da |
| `RESERVED` | cheie R (`extension`) din catalog | `null` | „Rezervat · neînvățabil V1” | nu |

Regulile nu depind de valoarea implicită:

- un zero real este `OBSERVED` cu `value: 0` și este afișat „0”, niciodată ascuns sau confundat cu
  lipsa valorii;
- o cheie neobservată are `value: null`; valoarea implicită din catalog este afișată doar ca
  metadată (`defaultValue`), nu ca valoare curentă;
- o cheie R este întotdeauna `RESERVED`, `value: null`, `source: null`, `evidenceCount: 0` și
  `learnable: false`, chiar dacă recordul profilului conține un număr pentru ea. „R” înseamnă rezervat
  pentru extensii, nu „învățat”.

Parserul respinge un cadru care ar marca o cheie R ca `OBSERVED`, ar pune o valoare pe o cheie
`UNOBSERVED` sau ar schimba `min`/`max`/`defaultValue`/unitatea față de catalog.

## Ilustrativ versus publicat

Fără un `DrivingProfile` publicat, `readProfilePanelSnapshot` construiește cadrul din valorile reale
ale catalogului, cu `profile: null`, `illustrative: true`, `delta: null` și bannerul explicit:

> Date ilustrative — serviciul de profiluri nu a publicat încă o versiune

Cadrul ilustrativ nu are niciun rând `OBSERVED`, nu pretinde o versiune publicată și nu folosește
cuvintele „învățat” sau „certificat” pentru valorile implicite. Cu un profil real, bannerul dispare,
badge-ul devine `PUBLICAT`, iar `illustrative` este `false`. Un cadru ilustrativ care ar conține un
profil publicat, sau invers, este respins.

## API

```ts
import { createProfilePanel, PROFILE_PANEL_ILLUSTRATIVE_BANNER } from './ui';
import { readProfilePanelSnapshot } from './app';

const panel = createProfilePanel(hostElement, { catalog: parameterDefinitions });

// Fără profil publicat: previzualizarea ilustrativă explicită.
panel.update(
  readProfilePanelSnapshot({ catalog: parameterDefinitions }, { tick }),
  nowMs,
);

// Cu versiunea reală 109 și delta ei opțională.
const snapshot = readProfilePanelSnapshot(
  { catalog: parameterDefinitions },
  { tick, profile, delta },
);
panel.update(snapshot, nowMs);   // cel mult 10 Hz
panel.open();                    // reafișează view-ul reținut
panel.close();                   // doar ascunde; nu golește rândurile
panel.getStats();                // elements, rows, createdRows, writes, skipped, updates, listeners
panel.dispose();                 // idempotent
```

Funcțiile pure exportate sunt `parseProfilePanelSnapshot`, `projectProfilePanel`,
`createIllustrativeProfilePanel`, `formatProfilePanelNumber`, `profilePanelUnitLabel`,
`isProfilePanelReserved`, `PROFILE_PANEL_LIMITS` și `PROFILE_PANEL_ILLUSTRATIVE_BANNER`.
`PROFILE_PANEL_VERSION` este `077-profile-panel-v1`. `PROFILE_PANEL_READ_ERRORS` din `src/app`
conține mesajele închise ale compunerii.

Catalogul este injectat explicit (`catalog: parameterDefinitions`), pentru că modulele de prezentare
pot importa contractele domeniului doar ca tipuri. Compunerea reală și testele folosesc întotdeauna
`parameterDefinitions`/`parameterRegistry`; un catalog fals sau incomplet este respins de parser.

## Snapshot

`ProfilePanelSnapshot` este înghețat și are câmpuri exacte. Orice câmp necunoscut, cheie duplicată,
metadata care nu coincide cu catalogul sau combinație contradictorie este respinsă înainte de orice
scriere în DOM.

| Câmp | Sursă reală | Regulă |
| --- | --- | --- |
| `schemaVersion`, `units`, `sessionId`, `worldEpoch` | contextul hostului | `1`, `SI`, identități mărginite |
| `tick` | tick-ul acceptat | întreg nenegativ, monoton în aceeași sesiune/epoch |
| `profile` | 109 `DrivingProfile` | ID, versiune, părinte, motor, `createdAt`, checksum |
| `illustrative` | compunere | `true` numai fără profil publicat |
| `parameters[].status/value/source/evidence*` | 109 + catalog 092 | 80 chei, valori în intervalul catalogului |
| `delta` | 109 `ProfileVersionDelta` | bază explicită și modificări învățabile |

`parameters[].label`, `category`, `unit`, `defaultValue`, `min` și `max` trebuie să fie exact cele din
catalogul 092 atunci când catalogul este injectat. `evidenceCount` este `0` când dovada lipsește;
`quality` și `uncertainty` sunt atunci `0`, explicit, nu inventate.

## Delta

`ProfilePanelDelta` conține `baseVersionId` și modificările `{ key, previous, next, reason,
evidenceCount }`. Fiecare rând afișează „0.5 m/s → 0 m/s”, motivul 109 și numărul de dovezi. Un zero
real rămâne vizibil și în delta.

- Baza trebuie să fie exact părintele versiunii afișate; o bază străină este o eroare închisă.
- Valoarea `next` trebuie să coincidă cu valoarea publicată a profilului.
- Cheile R sunt excluse din modificările învățate; un cadru care le-ar include este respins de parser.
- Un delta care conține numai chei R nu produce rânduri de delta.

## Formatare și scriere

| Valoare | Regulă | Exemplu |
| --- | --- | --- |
| Număr | maximum trei zecimale, fără dependență de locale | `2.500` → `2.5`, `0` → `0` |
| Unitate | unitatea canonică, cu etichete lizibile pentru raporturi | `m/s²`, `probabilitate` |
| Incertitudine | prefix `±`, aceeași formatare | `±0.25` |
| Dovezi | „n dovezi”, singular „1 dovadă” | `4 dovezi` |
| Sursă | `Învățat`, `Reglat manual`, `Bază`, `Importat` | `Învățat` |

Scrierile sunt plafonate la `10 Hz`. Schimbarea versiunii, a deltei sau a stării `illustrative`
ocolește plafonul; un cadru identic nu scrie nimic, chiar dacă tick-ul a avansat. Un cadru malformat,
în urmă sau cu ceas descrescător este respins înainte de orice atingere a DOM-ului.

## Accesibilitate

- `section[aria-label]` descrie versiunea sau starea ilustrativă și numărul de parametri observați,
  neobservați și rezervați; `aria-describedby` duce la regulile complete.
- Rezumatul este `role="status"` cu `aria-live="polite"` și `aria-atomic="true"`.
- Fiecare rând este un `li` cu `aria-label` complet; starea este purtată de text și de
  `data-status`, nu doar de culoare.
- `<details>`/`<summary>` oferă acces nativ din tastatură. Panoul nu instalează niciun listener de
  tastatură și nu are butoane care ar putea modifica un profil, deci tastele de condus rămân active.

## Limite

| Limită | Valoare |
| --- | ---: |
| Chei de catalog | 80 |
| Rânduri de parametru | 80 |
| Modificări de delta | 80 |
| Frecvență de scriere | 10 Hz |
| Elemente per rând | 7 |
| Contexte per parametru | 16 × 96 code units |
| Code units per identitate | 512 |
| Zecimale de afișare | 3 |
| Proiecții reținute | 1 |

## Verificare

`tests/ui/profile-panel.test.ts` (15 teste) acoperă parserul strict, bannerul ilustrativ, ștergerea
stării ilustrative de către un profil real, un zero real, o cheie neobservată, incertitudinea,
dovezile, o cheie R cu valoare numerică în record, rândurile de delta, excluderea cheilor R din delta,
stabilitatea nodurilor, plafonul de 10 Hz cu ocolirea la schimbarea versiunii, cadrul identic,
cadrele respinse, ciclul de viață și transcriptul comis.

```powershell
npm run profile:panel
npm run profile:panel -- --check
```

Runnerul scrie [report.json](Evidence/077-profile-panel/report.json) și
[report.md](Evidence/077-profile-panel/report.md): 7 scenarii deterministe (ilustrativ, profil real cu
zero/incertitudine/neobservat, delta, cheie R cu valoare numerică, cadru identic, 60 de cadre
plafonate, cadru respins) și 51 de verificări, inclusiv DOM-ul serializat pentru scenariile principale.
`npm test` include comparația cu transcriptul comis.

## Ce NU este

- Nu este 109: nu creează, nu derivează și nu validează numeric o versiune sau un delta.
- Nu este 110/112: nu publică, nu activează și nu propagă un profil la tick.
- Nu este estimator: nu produce `LEARNED`, dovezi, incertitudine sau valori.
- Nu este 027: nu oferă slidere și nu transformă un reglaj manual în valoare învățată.
- Nu măsoară FPS, GPU sau hardware; raportul este un transcript determinist, nu o probă de
  performanță.
- Nu este cablat în hostul live: contextul de sesiune poate fi injectat explicit, iar până atunci
  compunerea folosește `PROFILE_PANEL_LOCAL_CONTEXT` ca scop local documentat.
