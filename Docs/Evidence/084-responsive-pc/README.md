# Evidence 084 — Layout responsive pentru PC și viewport mic

Validare funcțională locală pentru PBI 084. Contractul este determinist, CSS-ul este real, fixture-ul
a fost măsurat în Chromium headless la 1280×720, 1920×1080 și 853×480 (echivalent 150% zoom), iar
cele cinci capturi PNG și `capture.json` sunt comise.

## Ce a fost livrat

- `src/ui/responsive-layout.ts` — `084-responsive-layout-v1`: breakpoint-uri `COMPACT`/`STANDARD`/
  `LARGE`, zoom efectiv (`innerWidth / zoom`), plafoane pe regiuni, `essentialControls`,
  `findOverlaps`/`assertNoOverlap`, `textLegibility`, `scrollableRegion`, `RESPONSIVE_LAYOUTS` și
  variabilele CSS deterministe.
- `src/ui/index.ts` — exporturi aditive.
- `src/style.css` — variabile `--layout-*` (STANDARD în `:root`), media query-urile 1279/719 și
  1920×1080, coloana flotei sub HUD cu scroll intern, modaluri centrale cu `max-height`/scroll/antet
  lipicios, fonturi de minimum 0.75rem și line-height 1.4. Fără redesign.
- `tests/ui/responsive-layout.test.ts` — 20 de teste.
- `tests/ui/responsive-fixture.html` — HUD, minimapă, 30 de rânduri de flotă, profil, tablou, setări și
  notificări, cu `data-testid` stabile și `window.__measureResponsive()`.
- `tests/app/responsive-layout-report.ts`, `scripts/run-responsive-layout-report.mjs`,
  `npm run ui:responsive` — 7 scenarii, 42 de verificări, `report.json` și `report.md`.
- `scripts/capture-responsive.mjs` — captură Playwright opțională (3 rezoluții + tablou + setări).
- `Docs/responsive-layout.md`, pointeri aditivi în `Docs/08-...`, `Docs/27-...`, `Docs/README.md`.

## Ce a fost corectat la verificarea de layout

Verificarea locală de layout (Chrome headless, fără artefacte comise) a expus câteva defecte reale,
reparate fără redesign:

| Constatare | Reparație |
| --- | --- |
| `.profile-panel__row` avea `grid-template-areas` cu 2 coloane în primele două rânduri și 3 în al treilea, deci browserul arunca declarația; eticheta, valoarea, motivul și dovezile se suprapuneau. | Rândurile au acum placeholder `.` pentru coloana liberă; cele trei linii se separă corect. |
| Plafoanele erau aplicate pe content-box, deci coloana flotei depășea panoul central cu ~11 px la 1280×720. | `box-sizing: border-box` pentru toate suprafețele de layout; dreptunghiurile declarate coincid cu cele reale. |
| Butoanele din rândul de mod al HUD-ului foloseau padding-ul generic și umflau HUD-ul; coloana flotei pornea peste HUD. | Padding compact pentru butoanele HUD și rezervă `--layout-hud-reserve: 22rem`, care acoperă HUD-ul real (~337 px la 1280×720). |
| `[hidden]` era ignorat de panourile cu `display: grid` (tablou, setări, notificări). | Reguli `[hidden] { display: none; }` pentru cele trei clase. |

## Breakpoint-uri, zoom și suprapunere

| Regiune | Condiție | HUD | Minimapă | Flotă | Panou | Rânduri |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `COMPACT` | ≤1279 px lățime sau ≤719 px înălțime | 15rem | 10rem | 14rem | 24rem | 8 |
| `STANDARD` | 1280×720–1919×1079 | 22rem | 15rem | 24rem | 26rem | 10 |
| `LARGE` | ≥1920×1080 | 22rem | 15rem | 26rem | 32rem | 14 |

- Zoom: `effectiveWidth = width / zoom`, `effectiveHeight = height / zoom`; 1280×720 la 150% →
  853,33×480 și regiunea `COMPACT`.
- Ancore: HUD stânga-sus, minimapă dreapta-sus, flotă în coloana stângă sub HUD, profil/tablou/setări
  ca modal central, notificări în coloana dreapta sub minimapă (10rem în `COMPACT`).
- `findOverlaps` întoarce numai intersecții cu arie pozitivă; `assertNoOverlap` aruncă
  `Responsive layout overlap: a × b`. ID lipsă/duplicat, coordonate nefinite și dimensiuni ≤ 0 sunt
  erori închise.
- Controale esențiale: `speed-output`, `mode-buttons`, `minimap-status`, `pause-control`,
  `recovery-control`. Niciun breakpoint nu le acoperă sau le ascunde.
- Text: minimum 12 CSS px, line-height ≥ 1.4; zoom-ul crește pixeii de dispozitiv (12 px × 1.5 = 18),
  nu micșorează dimensiunea CSS.
- Scroll: `max-height: min(90vh, …)`, `overflow-y: auto`, `overflow-x: hidden`,
  `scrollbar-width: thin`, `min-width: 0`, `overflow-wrap: anywhere`.

## Fixture și statusul capturii

- Fixture: `tests/ui/responsive-fixture.html`, servibil de Vite la
  `/tests/ui/responsive-fixture.html`. Parametri: `?center=profile|city|settings` și `?zoom=1.5`.
- `window.__measureResponsive()` întoarce `viewport`, `zoom`, `effectiveWidthPx`,
  `effectiveHeightPx`, `rects` (panouri + esențiale), `overlaps` (`critical`/`transient`),
  `scrollable`, `rows`, `minFontPx`, `lineHeight`, `layoutVariables`.
- `node scripts/capture-responsive.mjs` → **5 capturi, 50/50 verificări, overall PASS**; scrie PNG-urile
  și `capture.json`. Fiecare caz verifică regiunea media query, cele 30 de rânduri, vizibilitatea
  controalelor esențiale, absența suprapunerilor critice, scroll-ul listei și al modalului,
  `minFontPx >= 12`, line-height ≥ 1.4 și încadrarea în viewport.
- Măsurători reale la 1280×720: HUD 352×337 px, minimapă 240×291 px, flotă 384×324 px cu lista
  derulabilă (1715 px conținut / 206 px vizibil), profil 416×648 px cu scroll (1489/646),
  notificări în dreapta la x=880, zero suprapuneri, font minim 12 px, line-height 1.4.
- La 1920×1080 coloana flotei și modalul sunt mai late, iar la 853×480 notificările sunt îngustate
  la 10rem și rămân în dreapta, fără să atingă HUD-ul, lista sau profilul.

## Comenzi și rezultate

```powershell
npm run typecheck            # exit 0
npm run lint                 # exit 0
npm run format:check         # All matched files use Prettier code style!
npm run check:architecture   # Architecture imports: PASS (225 TypeScript files) + 3 probe groups
npm test                     # tests 1497, pass 1497, fail 0
npm run ui:responsive        # SUMMARY checks 42/42, scenarios 7, overall PASS
npm run ui:responsive -- --check  # Responsive layout report is current
node scripts/capture-responsive.mjs  # 5 captures, 50/50 checks, PASS; wrote capture.json
```

## Limite

- Capturile folosesc fixture-ul determinist, nu aplicația live cu o sesiune de flotă; totuși
  dreptunghiurile, scroll-ul și fonturile sunt măsurate de Chromium pe CSS-ul real.
- La 150% zoom (853×480 efectiv) coloana flotei are doar ~6rem sub HUD; panoul derulează ca întreg,
  iar lista păstrează 5rem cu scroll propriu. Textul și controalele esențiale rămân legibile, iar
  notificările stau în dreapta, îngustate, fără să acopere HUD-ul, lista sau profilul.
- La 1280×720, cu HUD-ul complet și notificările vizibile, în coloana flotei încap aproximativ 3-4
  rânduri (rândurile se rup pe două linii); plafonul de 10 este o limită superioară, nu o promisiune.
- Plafonul de rânduri (8/10/14) este o limită de proiectare; numărul vizibil real depinde de
  înălțimea HUD-ului și de lățimea textului.
- Nu înlocuiește gate-ul 235, zoom 200%, `forced-colors`, cititoare de ecran, FPS sau hardware.
- Nu schimbă contractele 073–083 și nu atinge gameplay-ul, fizica, profilul sau autoritatea.
