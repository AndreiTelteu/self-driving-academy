# Remaparea comenzilor 080

Status: implementare și validare funcțională locală. `src/ui/key-remapping-format.ts` deține
contractul, normalizarea codurilor, conflictele și proiecția pură; `src/ui/key-remapping.ts` este
adaptorul DOM cu captura de tastă; `src/app/key-remapping.ts` compune setările reale 009. Modulul nu
definește profiluri, parametri învățați, telemetrie sau XP.

## Ce face

Toate cele 15 acțiuni publice 009 sunt listate mereu, fiecare cu tasta curentă, tasta implicită, tasta
propusă și starea explicită. O remapare schimbă numai `input.bindings` din setările dispozitivului.
Conflictele și tastele invalide sunt afișate inline și într-o regiune politicoasă, iar butonul
„Salvează” rămâne dezactivat până când propunerea este validă și diferită de setările salvate.

```ts
import { createKeyRemappingPanel } from './ui';
import { applyKeyRemapping, readKeyRemappingDraft, resetKeyRemapping } from './app';

const draft = readKeyRemappingDraft(settings, currentPlayerId); // aruncă pentru alt jucător
const panel = createKeyRemappingPanel(host, draft, {
  save: (bindings) => applyKeyRemapping({ store, settings }, panel.getDraft()),
  cancel: () => undefined,
});
panel.update(nextDraft, nowMs); // sau setDraft(nextDraft)
panel.isCapturing();
panel.cancelCapture();
panel.getStats();
panel.dispose(); // idempotent
```

Funcțiile pure exportate sunt `createKeyRemappingDraft`, `parseKeyRemappingDraft`,
`normalizeKeyCode`, `isSupportedKeyCode`, `formatKeyCode`, `setBinding`, `clearBinding`,
`resetBindings`, `revertBindings`, `keyRemappingBindings`, `keyRemappingHasChanges` și
`projectKeyRemapping`. `KEY_REMAPPING_VERSION` este `080-key-remapping-v1`.

## Contractul draftului

Un `KeyRemappingDraft` este înghețat și are câmpuri exacte: `schemaVersion: 1`, `version`,
`playerId`, `bindings`, `defaults`, `proposed`, `rejections`, `revision`. `bindings` este copia
setărilor 009 salvate, `defaults` este rezultatul real al `createDefaultSettings(playerId)`, iar
`proposed` este propunerea locală. `rejections` conține numai motive închise și numai pentru acțiuni
cu propunere goală. Parserul respinge câmpuri suplimentare, obiecte exotice, getters, coduri
nesuportate, duplicate în `bindings`/`defaults` și revizii invalide.

| Acțiune | Etichetă | Critică |
| --- | --- | --- |
| `throttle` | Accelerație | da |
| `brake` | Frână | da |
| `steerLeft` | Direcție stânga | da |
| `steerRight` | Direcție dreapta | da |
| `handbrake` | Frână de mână | da |
| `manualMode` | Mod AUTO/MANUAL | da |
| `learningMode` | Mod LEARNING | da |
| `kpis` | Panou KPI | |
| `fleet` | Lista flotei | |
| `signalLeft` | Semnalizare stânga | |
| `signalRight` | Semnalizare dreapta | |
| `camera` | Cameră | |
| `profile` | Panou profil | |
| `pause` | Pauză | da |
| `recover` | Recuperare | da |

„Critică” marchează acțiunile de condus, siguranță și mod care trebuie să rămână accesibile. Toate
cele 15 acțiuni rămân însă în listă și în draft, indiferent de conflict sau tastă invalidă.

## Normalizare și respingeri

Se acceptă exclusiv `KeyboardEvent.code`, cu aceeași gramatică ca `parseInputPreferences` din 009:
`KeyA`–`KeyZ`, `Digit0`–`Digit9`, săgeți, `Space`, `Tab`, `Escape`, `Enter`, `Backspace`,
`ShiftLeft/Right`, `ControlLeft/Right`, `AltLeft/Right` și `F1`–`F12`. `event.key` nu este acceptat
niciodată.

| Motiv | Când apare |
| --- | --- |
| `EMPTY` | valoare non-string, goală sau doar spații; și după `clearBinding` |
| `MODIFIER_ONLY` | `Shift`, `Control`, `Alt`, `Meta`, `AltGraph`, `CapsLock`, `MetaLeft` etc. |
| `UNSUPPORTED_CODE` | literă/cifră simplă, cod necunoscut, `F13`, text |
| `RESERVED_BROWSER_CODE` | `F1`, `F3`, `F5`, `F6`, `F7`, `F10`, `F11`, `F12` |

Un cod respins nu este ignorat: rândul devine `UNSUPPORTED`, propunerea devine goală, iar motivul
închis este afișat. `clearBinding` face același lucru explicit, fără să elimine rândul. Un cod rezervat
rămâne citibil dintr-o setare 009 veche, dar nu poate fi capturat din nou.

## Conflicte și stări

Proiecția construiește harta cod → acțiuni. Fiecare cod folosit de mai mult de o acțiune apare în
`conflicts`, ambele rânduri primesc `CONFLICT` și `conflictWith`, iar mesajul inline numește cealaltă
acțiune. Rezolvarea cere remaparea uneia dintre acțiuni sau eliberarea ei; modulul nu mută singur
cealaltă comandă.

| Stare rând | Semnificație |
| --- | --- |
| `UNCHANGED` | propunerea este identică cu setarea salvată |
| `VALID` | propunere validă, diferită, fără conflict |
| `CONFLICT` | codul este folosit de cel puțin o altă acțiune |
| `UNSUPPORTED` | propunere goală sau respinsă |

`saveState` este `UNSUPPORTED`, apoi `CONFLICT`, apoi `UNCHANGED`, apoi `DIRTY`. `canSave` este
`true` numai pentru `DIRTY`; orice conflict sau tastă invalidă blochează salvarea. Un draft cu o
acțiune lipsă nu poate fi construit, pentru că parserul cere exact cele 15 chei.

## Reset, salvare și anulare

- `resetBindings` propune valorile reale din `createDefaultSettings(playerId)`; nu inventează
  duplicate. Resetarea din panou cere un al doilea click de confirmare.
- Resetarea și captura schimbă numai draftul local. Nimic nu este persistat fără „Salvează”.
- „Salvează” este activ numai pentru `DIRTY` și emite exact o intenție `save(bindings)` prin portul
  injectat.
- „Renunță” readuce propunerea la `bindings`-ul salvat și golește respingerile; emite opțional
  `cancel(draft)`.
- `applyKeyRemapping` refuză închis `INVALID_DRAFT`, `PLAYER_MISMATCH`, `STALE_DRAFT`,
  `UNSUPPORTED` și `CONFLICT`. Un draft valid construiește setările complete și apelează atomic
  `SettingsStore.replace`.
- Schimbarea bindingurilor **nu** incrementează `input.control.version`. Contractul 009 cere o
  revizie strict mai nouă numai când se schimbă o preferință de control; unitățile, calitatea,
  scenariul, camera și tot obiectul `control` rămân identice.
- `resetKeyRemapping` restaurează exact bindingurile implicite și păstrează toate celelalte secțiuni,
  inclusiv revizia și FOV-ul controlului. Cere ca `settings` să fie snapshotul curent al store-ului;
  un record învechit este refuzat cu eroare, ca să nu suprascrie setări mai noi.

## Captura, focusul și tastatura

- Un click pe butonul unei taste intră într-o stare explicită „Apasă o tastă…”. Următorul `keydown`
  de pe acel buton este capturat, cu `preventDefault()` și `stopPropagation()`.
- Listenerul `keydown` este atașat numai butonului aflat în captură și este eliminat imediat după
  captură, anulare sau `dispose`. Modulul nu instalează listeneri pe `window`, `document` sau host.
- `Escape` anulează captura și nu închide panoul; `Escape` nu poate fi capturat ca tastă nouă.
- `Tab`, `Enter` și `Space` sunt coduri valide: `preventDefault()` împiedică mutarea focusului și a
  doua activare a butonului, iar focusul rămâne pe butonul de remapare.
- Cât timp panoul sau un buton are focus, modulul nu interpretează taste de condus; singura
  interpretare este captura explicită. Blocarea tastelor de condus în timpul focusului aparține
  adaptorului 025/067, nu acestui modul.
- `update(draft, nowMs)` păstrează noduri stabile per acțiune, refuză un ceas descrescător și nu
  aplică un plafon artificial de 10 Hz: acțiunile utilizatorului sunt rare. O semnătură identică nu
  scrie nimic (`skipped`), iar fiecare scriere de text/atribut este numărată.

## Separarea setărilor de profilul învățat

Bindingurile sunt stare de dispozitiv și aparțin exclusiv `RuntimeSettings.input.bindings`.
`src/app/key-remapping.ts` nu importă `src/profiles`, nu citește `DrivingProfile`, parametri învățați,
telemetrie sau XP și nu are altă persistență decât `SettingsStore` injectat. Un profil nu poate fi
parsat ca setări și invers; `applyKeyRemapping` și `resetKeyRemapping` nu modifică niciun instantaneu
de profil.

## Accesibilitate și limite

`section[aria-label]` cu `aria-describedby` descrie regula; fiecare rând este un `li` cu `data-action`
și `data-state`, iar butonul tastei are `aria-label` complet. Mesajele de conflict sunt inline și în
`role="status"` cu `aria-live="polite"` și `aria-atomic="true"`. Simbolurile însoțesc textul, nu îl
înlocuiesc.

| Limită | Valoare |
| --- | ---: |
| Acțiuni listate | 15 |
| Elemente DOM | 116 |
| Noduri de text | 97 |
| Listenere permanente | 18 |
| Listenere de captură simultane | 1 |
| Drafturi reținute | 1 |
| Istoric | 0 |
| Frecvență de scriere | fără plafon artificial; scrieri identice zero |

## Verificare

`tests/ui/key-remapping.test.ts` (16 teste) acoperă contractul, cele 15 acțiuni, conflictele,
rezolvarea, respingerile, resetarea, randarea, captura, `Escape`, `Tab`/`Enter`/`Space`, ștergerea
explicită, scrierile identice, confirmarea resetării, anularea și `dispose`.
`tests/app/key-remapping.test.ts` (6 teste) acoperă citirea pentru jucătorul curent, salvarea care
păstrează celelalte setări, refuzurile închise, no-op-ul și separarea de profil.

```powershell
npm run key:remapping
npm run key:remapping -- --check
```

Runnerul scrie [report.json](Evidence/080-key-remapping/report.json) și
[report.md](Evidence/080-key-remapping/report.md): 7 scenarii deterministe (implicite, conflict,
conflict rezolvat, coduri nesuportate, reset, salvare care păstrează restul setărilor, captură) și 51
de verificări, inclusiv DOM-ul serializat. Captura de tastă din raport este sintetică; nu este o
probă de input fizic în browser.

## Ce NU este

- Nu este 009: nu modifică schema, parserul, store-ul sau valorile implicite ale setărilor.
- Nu este 025/067: nu filtrează condusul, nu ține taste apăsate și nu decide modul.
- Nu este 229: nu implementează slider-ele de control și nu incrementează revizia de control.
- Nu este profil, learning, telemetrie sau XP; nu publică, nu restaurează și nu compară profiluri.
- Nu persistă singur: fără portul `save` și fără `SettingsStore.replace` nimic nu este scris.
- Nu măsoară FPS, GPU sau hardware; raportul este un transcript determinist.
