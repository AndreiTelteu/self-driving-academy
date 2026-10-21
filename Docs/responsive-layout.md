# Layout responsive pentru PC și viewport mic (084)

Status: contract și implementare CSS locală, plus un fixture măsurabil în browser. Contractul este
`src/ui/responsive-layout.ts` (`084-responsive-layout-v1`), regulile reale sunt în `src/style.css`, iar
fixture-ul de inspecție este `tests/ui/responsive-fixture.html`. Modulul este geometrie pură: nu
citește DOM-ul, nu măsoară browserul, nu instalează listeneri și nu schimbă nicio regulă de joc,
fizică, profil sau autoritate. Dimensiunile reale vin din browser prin `window.__measureResponsive()`
sau din captura opțională `scripts/capture-responsive.mjs`; contractul oferă numai plafoanele și
ancorele deterministe.

## Ownership

| Componentă | Deține | Nu face |
| --- | --- | --- |
| `responsive-layout` | breakpoint-uri, regiuni, plafoane, zoom, esențiale, geometrie de suprapunere, reguli de scroll, variabile CSS | nu citește DOM-ul, nu măsoară, nu ascunde controale, nu redesenează panouri |
| `src/style.css` | regulile reale pentru HUD, minimapă, coloana flotei, modalurile centrale, notificări | nu schimbă structura DOM sau contractele 073–083 |
| fixture + capture | dreptunghiuri reale, scroll real, font real, PNG-uri opționale | nu este parte din `npm test` și nu certifică FPS/hardware |
| 073–083 | HUD, minimapă, flotă, profil, istoric, notificări, setări, tablou, accesibilitate | rămân proprietarii conținutului și ai focusului |

## Breakpoint-uri

`effectiveWidth = innerWidth / zoom` și `effectiveHeight = innerHeight / zoom`, exact aritmetica pe
care o văd media query-urile când browserul aplică zoom. `COMPACT` are prioritate, apoi `LARGE`.

| Regiune | Condiție | HUD | Minimapă | Flotă | Panou central | Rânduri flotă (plafon) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `COMPACT` | width ≤ 1279 px **sau** height ≤ 719 px | 15rem | 10rem | 14rem | 24rem | 8 |
| `STANDARD` | 1280×720 … 1919×1079 | 22rem | 15rem | 24rem | 26rem | 10 |
| `LARGE` | width ≥ 1920 px **și** height ≥ 1080 px | 22rem | 15rem | 26rem | 32rem | 14 |

La zoom ≥ 150% fereastra 1280×720 devine efectiv ~853×480 și intră în `COMPACT`; nu există un mod
separat „zoom”, pentru că media query-urile primesc deja viewport-ul redus. `RESPONSIVE_LAYOUTS`
fixează cele trei cazuri cerute: `1280x720`, `1920x1080` și `zoom-150`.

## Regiuni și ancore

| Suprafață | Ancoră | Contract |
| --- | --- | --- |
| `hud` | `top-left` | viteză, mod, taxi, etapă, obiectiv, ETA, progres; fără scroll intern |
| `minimap` | `top-right` | canvas + status; rămâne deasupra canvasurilor prin `z-index: 2` |
| `fleet` | `left-column` | începe sub HUD la `inset + hudReserve + gap`, are scroll intern și plafon de rânduri |
| `center` | `center` | profil, tablou și setări: modal central cu `max-height` și `overflow-y: auto` |
| `notifications` | `right-column` | sub minimap, `z-index: 4`, lățime îngustată în `COMPACT` (10rem) ca să nu atingă panoul central |

Coloana flotei nu acoperă HUD-ul sau minimapa la niciun breakpoint. Panoul central este centrat în
banda liberă dintre coloane; în `COMPACT` este plasat explicit între ele (`left` = lățimea HUD +
2×gap, `right` = lățimea minimă a minimap-ului + 2×gap), ca să nu acopere viteza, butoanele de mod,
statusul minimap-ului sau controalele de pauză/recuperare.

Notificările stau în coloana din dreapta, sub minimap, nu peste HUD, listă sau panoul central. Pe
viewporturi înguste sunt îngustate la 10rem și derulează în interior; verificarea de suprapunere le
tratează separat (`severity: 'transient'`), niciodată ca esențiale.

## Controale esențiale

`essentialControls(viewport)` întoarce exact cinci controale, toate `alwaysVisible: true`:

| ID | Test ID în fixture | Unde stă |
| --- | --- | --- |
| `speed-output` | `essential-speed` | HUD |
| `mode-buttons` | `essential-mode-buttons` | HUD |
| `minimap-status` | `essential-minimap-status` | minimapă |
| `pause-control` | `essential-pause` | HUD |
| `recovery-control` | `essential-recovery` | HUD |

Niciun breakpoint nu ascunde aceste suprafețe: CSS-ul nu conține `display: none` pentru HUD sau
minimapă, iar testele verifică absența unei astfel de reguli.

## Geometrie și suprapunere

`findOverlaps(rects)` întoarce intersecțiile cu arie strict pozitivă (`a`, `b`, `widthPx`,
`heightPx`, `areaPx`). `assertNoOverlap(rects)` aruncă `Responsive layout overlap: a × b` când
există cel puțin una. Ambele validează închis: `id` lipsă, `x`/`y` nefinit, `width`/`height` ≤ 0 și
`id` duplicat produc erori, nu valori implicite.

`computeResponsiveLayout({ widthPx, heightPx, zoom })` include și `rects`, dreptunghiurile declarate
din aceleași plafoane ca CSS-ul: `hud`, `minimap`, `fleet`, `center`, `notifications`. Ele sunt o
limită superioară deterministă, utilă pentru raport; browserul raportează dreptunghiurile reale.
Notificările sunt excluse din verificarea critică.

## Text, scroll și zoom

- `textLegibility({ widthPx, zoom, fontSizePx })` cere `fontSizePx >= 12` CSS px și line-height
  ≥ 1.4. Zoom-ul crește `deviceFontPx` (`12 px × 1.5 = 18 px`), dar nu micșorează dimensiunea CSS;
  de aceea pragul se aplică mărimii rezolvate, nu celei de dispozitiv.
- `scrollableRegion(viewport)` întoarce `max-height: min(90vh, …)`, `overflow-y: auto`,
  `overflow-x: hidden`, `scrollbar-width: thin`, `min-width: 0` și `overflow-wrap: anywhere`.
- Panourile centrale au antet lipicios, `min-width: 0`, text care se rupe și scroll vertical; lista
  flotei are propriul container de scroll, astfel încât cele 30 de rânduri rămân accesibile.
- Fonturile micro-textului au fost ridicate la minimum 0.75rem (12 px), iar line-height-ul
  panourilor la 1.4; valorile sunt în CSS, nu inventate de raport.

Plafonul de rânduri este o limită superioară, nu o promisiune: la 1280×720, cu HUD-ul complet și
notificări vizibile, în coloană încap mai puține rânduri decât plafonul de 10, iar lista derulează.
La 1920×1080 încap mai multe rânduri decât la 1280×720. Numărul real este raportat de fixture.

## API

```ts
import {
  RESPONSIVE_LAYOUTS,
  computeResponsiveLayout,
  essentialControls,
  findOverlaps,
  scrollableRegion,
  textLegibility,
} from './ui';

const layout = computeResponsiveLayout({ widthPx: innerWidth, heightPx: innerHeight, zoom: 1.25 });
layout.region;                 // COMPACT | STANDARD | LARGE
layout.effectiveWidthPx;       // innerWidth / zoom
layout.surfaces.fleet;         // ancoră, plafoane, scroll, maxVisibleRows
layout.cssVariables;           // exact variabilele --layout-* aplicate de host
layout.rects;                  // geometria declarată, nu măsurători de browser

for (const control of essentialControls({ widthPx: innerWidth, heightPx: innerHeight, zoom: 1.25 }))
  control.alwaysVisible;       // true pentru toate cele cinci

findOverlaps(layout.rects.filter((rect) => rect.id !== 'notifications')); // []
scrollableRegion({ widthPx: 1280, heightPx: 720, zoom: 1 });
textLegibility({ widthPx: 1280, zoom: 1.5, fontSizePx: 12 });            // legible: true
```

## Reguli CSS

`src/style.css` definește `--layout-inset`, `--layout-gap`, `--layout-hud-width`,
`--layout-hud-reserve`, `--layout-hud-font`, `--layout-minimap-width`, `--layout-minimap-font`,
`--layout-fleet-width`, `--layout-fleet-row`, `--layout-fleet-chrome`, `--layout-fleet-max-rows`,
`--layout-panel-width`, `--layout-panel-max-height`, `--layout-notifications-width` și
`--layout-font-scale`. Valorile din `:root` sunt cele `STANDARD`; două media query-uri le suprascriu
pe cele `COMPACT` și `LARGE`:

```css
@media (max-width: 1279px), (max-height: 719px) { /* COMPACT */ }
@media (min-width: 1920px) and (min-height: 1080px) { /* LARGE */ }
```

Alte reguli adăugate: coloana flotei ancorată sub HUD cu `max-height` plafonat și listă cu scroll;
modalurile centrale cu `max-height: var(--layout-panel-max-height)`, antet lipicios și text care se
rupe; HUD/minimapă cu font `max(0.75rem, var(--layout-*))`; `[hidden]` respectat și pentru panourile
cu `display: grid`; `scrollbar-width: thin` pe containerele care derulează. Focusul rămâne pe
contururile existente de 3 px; `scroll-padding-block` ține conturul departe de marginea de scroll.

## Ce a fost corectat la inspecția în browser

Fixture-ul a expus câteva defecte reale, reparate fără redesign:

- `grid-template-areas` de la `.profile-panel__row` avea rânduri cu număr diferit de coloane
  (`'label value'` față de `'uncertainty evidence source'`), deci browserul arunca întreaga
  declarație și eticheta, valoarea, motivul și dovezile se suprapuneau. Rândurile au acum un
  placeholder `.` pentru coloana liberă, iar cele trei linii se separă corect.
- Plafoanele `--layout-*` sunt aplicate cu `box-sizing: border-box`, deci lățimile declarate de
  contract coincid cu dreptunghiurile reale (padding și bordură incluse). Fără această regulă,
  coloana flotei depășea panoul central cu ~11 px la 1280×720.
- Butoanele din rândul de mod al HUD-ului au padding compact, ca rândul să nu umfle HUD-ul, iar
  rezerva `--layout-hud-reserve` (22rem) acoperă HUD-ul real (~337 px la 1280×720), astfel încât
  coloana flotei să înceapă sub el, nu peste el.

## Fixture și măsurare

`tests/ui/responsive-fixture.html` conține HUD, minimapă, listă cu 30 de taxiuri, profil cu 17
parametri, tablou, setări și trei notificări, toate cu clasele reale din `src/style.css` și cu
`data-testid` stabile (`panel-*`, `essential-*`). Parametrul `?center=profile|city|settings` alege
modalul vizibil, iar `?zoom=1.5` marchează cazul de zoom. `window.__measureResponsive()` întoarce
`{ viewport, zoom, rects, overlaps, scrollable, rows, minFontPx, lineHeight, layoutVariables }` din
dreptunghiurile reale ale browserului.

`scripts/capture-responsive.mjs` deschide fixture-ul la 1280×720, 1920×1080 și 853×480 (zoom 150%
efectiv), plus tabloul și setările la 1280×720, și verifică: nicio suprapunere critică între panouri
și controalele esențiale, toate esențialele vizibile, 30 de rânduri, lista scrollabilă, panoul central
scrollabil, `minFontPx >= 12`, line-height ≥ 1.4 și încadrarea în viewport. Fără Playwright scriptul
scrie un SKIP explicit și iese cu 0; PNG-urile și `capture.json` apar numai după o rulare reală.

## Verificare

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check:architecture
npm test
npm run ui:responsive
npm run ui:responsive -- --check
node scripts/capture-responsive.mjs
```

`tests/ui/responsive-layout.test.ts` are 20 de teste: breakpoint-uri la graniță, zoom efectiv,
layout-urile 1280/1920/150%, plafoane și gap-uri, rândurile flotei, controalele esențiale,
`findOverlaps`/`assertNoOverlap` cu erori închise, pragurile de legibilitate, regulile de scroll,
determinismul variabilelor CSS și corespondența cu `src/style.css`.

`npm run ui:responsive` rulează 7 scenarii și 42 de verificări peste contract și CSS; scrie
[report.json](Evidence/084-responsive-pc/report.json) și
[report.md](Evidence/084-responsive-pc/report.md). `--check` compară raportul comis cu ieșirea
curentă. Captura de browser este un artefact separat, opțional.

## Limite

- Contractul nu măsoară singur browserul; `scripts/capture-responsive.mjs` produce cele cinci capturi
  și `capture.json` cu dreptunghiuri reale în Chromium headless. Fără Playwright scriptul iese cu SKIP
  și nu pretinde nicio măsurătoare.
- La 150% zoom (efectiv 853×480) coloana flotei are ~6rem sub HUD: panoul derulează ca întreg, iar
  lista păstrează 5rem cu scroll propriu, deci se vede puțin conținut. Notificările stau în dreapta,
  îngustate la 10rem, și derulează în interior, fără să acopere HUD-ul, lista sau panoul central. La
  1280×720 încap aproximativ 3-4 rânduri, pentru că rândurile flotei se rup pe două linii.
- Plafonul de rânduri (8/10/14) este o limită de proiectare; numărul vizibil real depinde de înălțimea
  HUD-ului și de lățimea textului.
- Nu înlocuiește gate-ul 235 și nu certifică zoom 200%, `forced-colors`, cititoare de ecran, FPS sau
  hardware.
