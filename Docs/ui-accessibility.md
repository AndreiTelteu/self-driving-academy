# Accesibilitate contrast și tastatură (083)

Status: implementare și audit determinist local. Contractul este `src/ui/accessibility-format.ts`
(`083-ui-accessibility-v1`), managerul de focus este `src/ui/panel-focus.ts`
(`083-panel-focus-v1`), iar compunerea cu 070 este `src/app/ui-accessibility.ts`. Modulele nu conduc
mașina, nu schimbă profilul, fizica, camera sau autoritatea: ele descriu și verifică suprafețele
existente 073–082.

## Ownership

| Componentă | Deține | Nu face |
| --- | --- | --- |
| `accessibility-format` | tokenuri, descriptori, audit, planul de traversare, matricea tastelor blocate | nu citește DOM-ul, nu instalează listeneri, nu suspendă nimic |
| `panel-focus` | focusul unui singur panou deschis, Tab/Shift+Tab, Escape prin port, restaurarea focusului | nu închide singur panoul, nu trimite click sintetic, nu ascultă `window`/`document` |
| `ui-accessibility` (app) | raportul real și bridge-ul către 070 | nu revendică PLAYER, nu trimite comenzi de condus |
| 070 `createPauseFocusOwner` | decizia reală de suspendare și cauza | nu cunoaște focusul din DOM |
| 066/024/025 | autoritatea, comanda fizică, tastele ținute | rămân neatinse |

## Tokenuri și contrast

Culorile provin din literalii reali din `src/style.css`; variabilele CSS `--ui-*` din `:root` păstrează
exact aceleași valori. `contrastRatio` implementează luminozanța relativă WCAG și rotunjește la două
zecimale; `requiredContrast(sizePx, weight)` întoarce 4,5:1 pentru text normal, 3:1 pentru text mare
(`>= 24 px`, sau `>= 18,66 px` bold) și 3:1 pentru indicatori non-text (`sizePx = 0`).

| Pereche | Culori | Raport | Cerut | Panouri |
| --- | --- | ---: | ---: | --- |
| `text-on-surface` | `#f3f7fb` pe `#0d1714` | 16,97:1 | 4,5:1 | toate cele 10 |
| `text-on-raised` | `#f3f7fb` pe `#13251f` | 14,87:1 | 4,5:1 | flotă, profil, istoric, setări, tablou, remapare |
| `muted-on-surface` | `#b9cfc5` pe `#0d1714` | 11,13:1 | 4,5:1 | flotă, profil, istoric, setări, tablou, remapare, notificări, minimapă, HUD |
| `muted-on-raised` | `#b9cfc5` pe `#13251f` | 9,75:1 | 4,5:1 | flotă, profil, istoric, tablou, remapare |
| `secondary-on-surface` | `#c6dbd1` pe `#0d1714` | 12,57:1 | 4,5:1 | profil, istoric, tablou, notificări, minimapă |
| `secondary-on-raised` | `#c6dbd1` pe `#13251f` | 11,02:1 | 4,5:1 | flotă, setări, remapare |
| `strong-on-raised` | `#dbe8e2` pe `#13251f` | 12,69:1 | 4,5:1 | setări |
| `small-on-raised` | `#9bb3a8` pe `#13251f` | 7,17:1 | 4,5:1 | tablou |
| `success-on-surface` | `#9edbb5` pe `#0d1714` | 11,53:1 | 4,5:1 | profil, istoric, notificări, HUD |
| `success-on-raised` | `#9edbb5` pe `#13251f` | 10,10:1 | 4,5:1 | flotă, setări, remapare |
| `warning-on-surface` | `#ffd27f` pe `#0d1714` | 12,85:1 | 4,5:1 | profil, istoric, setări, tablou, notificări, HUD |
| `warning-on-raised` | `#ffd27f` pe `#13251f` | 11,26:1 | 4,5:1 | flotă, tablou, remapare |
| `error-on-raised` | `#ffb3a7` pe `#13251f` | 9,34:1 | 4,5:1 | flotă, istoric, setări, tablou, remapare, notificări, HUD |
| `focus-on-surface` | `#9edbb5` pe `#0d1714` | 11,53:1 | 3:1 | flotă, profil, istoric, tablou, remapare, hartă, HUD |
| `focus-on-raised` | `#9edbb5` pe `#13251f` | 10,10:1 | 3:1 | setări |
| `selected-on-raised` | `#7fd7ff` pe `#13251f` | 9,96:1 | 3:1 | flotă, profil, istoric, tablou |
| `selected-on-surface` | `#7fd7ff` pe `#0d1714` | 11,36:1 | 3:1 | hartă |
| `marker-ink-on-selected` | `#07110d` pe `#7fd7ff` | 11,93:1 | 4,5:1 | hartă |

Bordurile cu alpha (`--ui-border: #ffffff2b`) rămân valorile reale din CSS și nu sunt măsurate de
`contrastRatio`, care acceptă doar culori solide `#rgb`/`#rrggbb`. Indicatorii non-text auditați sunt
inelul de focus și chenarul selecției, ambele peste 3:1.

## Descriptori

Fiecare descriptor declară numele accesibil real, rolul, suprafața 070, modalitatea, tastele, tab
stopurile, conturul de focus, controalele native, lipsa listenerului global, starea purtată de text și
perechile de contrast.

| ID | Nume | Suprafață | Modal | Deschidere | Închidere | Tab stopuri |
| --- | --- | --- | --- | --- | --- | ---: |
| `fleet` | Lista taxiurilor | panel | nu | Tab | Escape | 3 |
| `profile` | Panoul profilului | panel | nu | P | Escape | 1 |
| `profileHistory` | Istoricul profilului | panel | nu | P | Escape | 3 |
| `gameSettings` | Setările jocului | menu | da | host | Escape | 4 |
| `cityDashboard` | Tabloul orașului | panel | nu | host | Escape | 1 |
| `keyRemapping` | Remaparea comenzilor | menu | da | host | Escape | 2 |
| `learningNotifications` | Notificări de analiză | diagnostic | nu | — | — | 0 |
| `minimap` | Minimapă nord-sus | diagnostic | nu | — | — | 0 |
| `mapSelection` | Selectare vehicule pe hartă | diagnostic | nu | — | — | 1 |
| `taxiHud` | HUD de condus | diagnostic | nu | — | — | 1 |

„Tab stopuri” numără selectorii focalizabili declarați, nu elementele dinamice. Butonul de închidere al
notificărilor are `tabindex="-1"` intenționat, deci nu fură focusul de la condus.

## Reguli de focus

1. `open(panelId, element)` reține focusul anterior, mută focusul pe primul control focalizabil și
   atașează un singur listener `keydown` pe elementul panoului.
2. Tab mută la următorul control, Shift+Tab la precedentul; ambele se înfășoară în panoul deschis.
3. Escape închide prin portul injectat `close(panelId)`, apoi restaurează focusul anterior. Un buton
   aflat în captură (080) oprește propagarea, deci Escape anulează captura înainte de a ajunge la panou.
4. Enter și Space rămân ale browserului: controlul nativ focalizat se activează singur, fără click
   sintetic.
5. Dacă panoul nu are niciun control focalizabil, `open` întoarce `false`, nu se marchează deschis,
   nu se atașează listener și apare un motiv vizibil (`role="alert"`, `.ui-focus-error`) plus
   `data-focus-state="NO_FOCUSABLE"`. Nu pretindem operare din tastatură.
6. `close()` local restaurează focusul fără să apeleze portul; `dispose()` este idempotent, elimină
   listenerul și nu apelează porturile. `getStats().listeners` este 0 sau 1, iar
   `getStats().globalListeners` este întotdeauna 0.

## Traversare

`planPanelTraversal(panelId)` întoarce ordinea tab stopurilor și efectul așteptat pentru Tab,
Shift+Tab, Escape, Enter și Space. Suprafețele `panel`/`menu` sunt ținute în panou când sunt deschise
prin controller; suprafețele `diagnostic` nu sunt niciodată ținute în capcană și folosesc ordinea
nativă a browserului. Planul este determinist și este serializat în raport pentru fiecare scenariu.

## Matricea tastelor de condus

`drivingKeysBlocked(panelId, open, mode)` compune exact tabelul 070; 070 rămâne proprietarul suspendării.

| Suprafață | AUTO | MANUAL | LEARNING |
| --- | --- | --- | --- |
| `panel` (flotă, profil, istoric, tablou) | live | blocat | blocat |
| `menu` (setări, remapare) | blocat | blocat | blocat |
| `diagnostic` (HUD, minimapă, hartă, notificări) | live | live | live |
| orice suprafață închisă | live | live | live |

## API

```ts
import {
  ACCESSIBILITY_TOKENS,
  PANEL_SURFACES,
  auditPanelAccessibility,
  contrastRatio,
  createPanelFocusController,
  drivingKeysBlocked,
  planPanelTraversal,
  requiredContrast,
} from './ui';
import {
  createPanelAccessibilityBridge,
  readAccessibilityReport,
  requireAccessibleUi,
} from './app';

const audit = auditPanelAccessibility(PANEL_SURFACES, ACCESSIBILITY_TOKENS);
const report = readAccessibilityReport();       // raportul real, cu failures închise
requireAccessibleUi(report);                    // aruncă dacă auditul nu trece

const focus = createPanelFocusController(host, { close: (id) => host.closePanel(id) });
focus.open('fleet', fleetElement);              // false + motiv vizibil dacă nu există tab stop
focus.shouldSuspendDriving('MANUAL');           // true pentru un panou deschis
focus.getStats();                               // listeners, globalListeners: 0, wraps, restores
focus.dispose();

const bridge = createPanelAccessibilityBridge({
  pauseFocus: owner,                            // 070
  closePanel: (id) => panels.close(id),
  resetHeldCommands: () => keyboard.reset(),    // 025, opțional
});
bridge.open('fleet');                           // doar setSurface('panel', true/false)
bridge.close('fleet');                          // eliberează suprafața + resetează tastele ținute
```

`readAccessibilityReport({ panels })` este punctul de injecție pentru teste: un descriptor stricat
produce `pass: false` și codul închis corespunzător. Codurile sunt `MISSING_NAME`, `NO_FOCUSABLE`,
`MISSING_VISIBLE_FOCUS`, `GLOBAL_KEY_LISTENER`, `COLOR_ONLY_STATE`, `LOW_CONTRAST`,
`NOT_KEYBOARD_OPERABLE` și `MISSING_TYPE_BUTTON`; niciunul nu este consultativ.

## Ce a fost găsit și reparat

- Toate butoanele reale din panourile 073–082 aveau deja `type="button"`; auditul și raportul
  verifică 28 de butoane serializate, iar un descriptor injectat fără atribut e respins.
- Niciun panou nu atașa listener pe `window`/`document`; captura 080 este singurul `keydown`, pe butonul
  focalizat, cu `stopPropagation`.
- Lipseau două reguli de focus vizibil: selecturile flotei (`.fleet-panel__filter`/`__sort`) și
  `summary`-ul HUD-ului. Ambele au primit contur de 3 px; restul panourilor aveau deja `:focus-visible`.
- Am adăugat variabilele `--ui-*` în `:root` și clasele partajate `.ui-focus-ring`/`.ui-focus-error`,
  fără să schimb valorile vizuale sau să redesenez vreun panou.
- Butoanele `control-mode-hud` și `diagnostics-panel` foloseau deja `type="button"` prin proprietate.

## Verificare

- `tests/ui/accessibility.test.ts` — 25 de teste: matematica contrastului, pragurile, auditul real,
  fiecare cod închis injectat, planul de traversare, matricea de condus, focus/Tab/Shift+Tab/Escape,
  fail-closed, listeneri scoped, dispose, bridge-ul 070 și corespondența cu `src/style.css`.
- `npm run ui:accessibility` — 7 scenarii reale (flotă, profil, istoric, setări, tablou,
  notificări+remapare, HUD+minimapă+hartă) și 53 de verificări, cu DOM serializat, tabel de contrast,
  ordine de focus și matrice de condus.
- `npm run ui:accessibility -- --check` compară raportul comis cu ieșirea curentă.

Dovezile sunt în [Evidence/083-ui-accessibility](Evidence/083-ui-accessibility/README.md).

## Ce NU este certificat

- Nu este o captură de browser și nu înlocuiește playtestul cu mouse/tastatură fizică.
- Nu este un test cu cititor de ecran real: numele/rolurile sunt citite din descriptori, nu anunțate de
  NVDA/VoiceOver.
- Nu simulează daltonismul, `forced-colors`, zoom 200% sau text mărit; acestea rămân pentru gate-ul 235.
- Nu măsoară FPS, memorie sau cost hardware; auditul este determinist și fără per-frame work.
- Nu schimbă contractele 073–082 și nu decide pauza: 070 rămâne proprietarul, iar bridge-ul nu
  revendică niciodată locul PLAYER.
