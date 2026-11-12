# Dovezi PBI 153 — QA vizual și accesibilitate V1

Verificarea vizuală și de accesibilitate a rulat pe **componentele reale din `src/ui`**, cu CSS-ul real
din `src/style.css`, într-un **Chromium 156.0.8078.4** real. Nu sunt machete: HUD-ul, minimapa, lista
celor 30 de taxiuri, notificările, profilul, tabloul orașului, setările, reglajele camerei și pop-up-ul
KPI sunt montate prin funcțiile lor publice (`createTaxiHud`, `createMinimap`, `createFleetPanel`,
`createLearningNotifications`, `createProfilePanel`, `createCityDashboard`, `createGameSettingsPanel`,
`createControlSlidersPanel`, `createKpiHistoryPanel`).

Rezultat: **22 capturi, 308 verificări, 300 trecute, 8 eșuate, 8 findings** (3 în cazul de stres
640×360, 5 la țintele PC). Verdictul CONTRACT este **FAIL** pentru că două componente reale au defecte
măsurabile; PBI 153 nu are voie să modifice `src/`, deci defectele sunt raportate cu captură și pași de
reproducere, nu reparate aici.

Raport: [report.json](report.json) și [report.md](report.md). Măsurători brute:
[measurements.json](measurements.json). Capturile: `capture-<scenariu>-<viewport>.png` (22 fișiere,
3 203 570 octeți).

## Ce s-a implementat

- `tests/ui/ui-qa.ts` — contractul determinist: matricea de viewport-uri, scenariile, suprafețele cu
  proprietarul lor, validarea strictă a măsurătorii, cele **14 verificări** și derivarea raportului
  (inclusiv comparația aceleiași componente la rezoluții diferite și findings-urile cu repro).
- `tests/ui/ui-qa.test.ts` — **22 de teste** deterministe: matricea, planul de capturi, cazul curat,
  fiecare regulă în negativ (text sub prag, text tăiat, text suprapus, contrast AA, control fără
  dreptunghi sau acoperit, suprafață în afara viewport-ului, politică de scroll, ordine de tab,
  focus vizibil, Escape), respingerea măsurătorilor trunchiate și determinismul raportului.
- `tests/browser/qa-ui-153/` — pagina reală: montează componentele, le deschide pe rând, măsoară
  dreptunghiuri, fonturi, line-height, scroll, contrast compus pe fundal, hit-test pe centrul fiecărui
  control, ordinea de tab și focusul vizibil. Expune `__qaPrepare`, `__qaMeasure`, `__qaFocus`.
- `scripts/run-ui-qa-report.mjs` — raportul: `npm run qa:ui` derivă `report.json`/`report.md` din
  măsurătorile comise; `--check` compară; `--browser` reface capturile în Chromium; `--strict`
  transformă un finding CONTRACT în exit code 1.
- `package.json` — intrarea `qa:ui`, ultima din blocul `"scripts"`.
- `Docs/18-validare-si-release.md` — secțiune nouă la final.

`src/` nu a fost modificat. Nu au fost atinse `src/missions/`, `Docs/28`, `tests/qa/`,
`tests/scenarios/`, `tests/e2e/`, `Docs/README.md` sau `PBI/README.md`.

## Matricea rulată

| Scenariu | Viewport | Regiune | Verdict | Verificări |
| --- | --- | --- | --- | ---: |
| HUD + minimapă + flotă + notificări | 1280×720 (100%) | STANDARD | PASS | 14/14 |
| HUD + minimapă + flotă + notificări | 1920×1080 (100%) | LARGE | PASS | 14/14 |
| HUD + minimapă + flotă + notificări | 1280×720 la 150% (853×480) | COMPACT | PASS | 14/14 |
| HUD + minimapă + flotă + notificări | 1920×1080 la 200% (960×540) | COMPACT | PASS | 14/14 |
| HUD + minimapă + flotă + notificări | 1280×720 la 200% (640×360) | COMPACT | **FAIL** | 13/14 |
| Lista flotei (30 de taxiuri) | 1280×720 | STANDARD | PASS | 14/14 |
| Lista flotei (30 de taxiuri) | 1280×720 la 200% (640×360) | COMPACT | **FAIL** | 13/14 |
| Notificări de învățare (3 mesaje) | 1280×720 | STANDARD | PASS | 14/14 |
| Notificări de învățare (3 mesaje) | 1280×720 la 150% (853×480) | COMPACT | PASS | 14/14 |
| Panoul profilului | 1280×720 | STANDARD | PASS | 14/14 |
| Panoul profilului | 1920×1080 | LARGE | PASS | 14/14 |
| Panoul profilului | 1280×720 la 150% (853×480) | COMPACT | PASS | 14/14 |
| Panoul profilului | 1920×1080 la 200% (960×540) | COMPACT | PASS | 14/14 |
| Panoul profilului | 1280×720 la 200% (640×360) | COMPACT | **FAIL** | 13/14 |
| Tabloul orașului | 1280×720 | STANDARD | PASS | 14/14 |
| Tabloul orașului | 1920×1080 | LARGE | PASS | 14/14 |
| Setările jocului (cameră, unități, confort) | 1280×720 | STANDARD | PASS | 14/14 |
| Setările jocului | 1280×720 la 150% (853×480) | COMPACT | PASS | 14/14 |
| Setările jocului | 1920×1080 la 200% (960×540) | COMPACT | PASS | 14/14 |
| Reglajele camerei și ale confortului | 1280×720 | STANDARD | **FAIL** | 13/14 |
| Pop-up KPIs cu grafice istorice | 1280×720 | STANDARD | **FAIL** | 12/14 |
| Pop-up KPIs cu grafice istorice | 1920×1080 | LARGE | **FAIL** | 12/14 |

Nivelul `CONTRACT` acoperă rezoluțiile documentate (1280×720, 1920×1080), cazul de zoom documentat
(150%) și zoomul de 200% pe ținta full-HD. Nivelul `STRESS` este 200% pe fereastra de 720p, adică
640×360 CSS px efectivi, sub banda declarată de 084; acolo măsurătoarea este păstrată și raportată, nu
ascunsă și nu transformată în PASS.

## Ce s-a măsurat per componentă (numere reale)

| Componentă | 1280×720 | 1920×1080 | 150% (853×480) | 200% (960×540) | 640×360 |
| --- | --- | --- | --- | --- | --- |
| HUD | 352×313,44 px | 352×322,42 px | 240×332,63 px | 240×332,63 px | 240×332,63 px |
| Minimapă | 240×290,52 px | 240×293,08 px | 160×227,14 px | 160×227,14 px | 160×227,14 px |
| Lista flotei | 384×324 px (y=380), 30 rânduri, listă 2153/206 px | 416×684 px, listă 1829/566 px | 224×96 px, listă 4001/80 px | 224×144 px, listă 4001/128 px | 224×96 px (y=380) |
| Notificări | 384×255,81 px | 416×237,91 px | 160×144 px (listă 597/144) | 160×144 px | 160×144 px (y=240) |
| Panoul profilului | 416×648 px (conținut 6794/646) | 512×864 px (6124/862) | 384×432 px (7277/430) | 384×486 px (7277/484) | 192×324 px (32151/322) |
| Tabloul orașului | 416×648 px (855/646) | 416×648 px (855/646) | — | — | — |
| Setările jocului | 416×648 px (880/646) | 416×648 px (880/646) | 384×432 px (1421/430) | 384×486 px (1421/484) | — |
| Reglajele camerei | 416×648 px (646/646) | — | — | — | — |
| Pop-up KPIs | 970×690 px (688/688) | 970×690 px (688/688) | — | — | — |

- **Contrast**: 9 538 de noduri text au fost măsurate cu perechile de culori compuse pe fundalul real
  (panou translucid peste `#13251f`); **0** perechi sub WCAG AA pentru mărimea lor.
- **Controale**: 874 măsurători de control (dreptunghi, vizibilitate, hit-test pe centru, ascunzătoare
  în container derulabil); toate au dreptunghi nenul, iar cele acoperite sunt doar cele din spatele unui
  modal, comportament declarat.
- **Font minim**: 12 px în 20 din 22 de capturi; excepțiile sunt defectele D4–D8 de mai jos.
- **Line-height minim**: 1,4 în toate capturile (cifrele de afișaj ≥ 24 px, cum e viteza din HUD, sunt
  exceptate de la prag, ca în 084).
- **Scroll**: lista flotei și panourile centrale care depășesc înălțimea au `overflow-y: auto` cu
  conținut real mai mare decât fereastra (de exemplu profilul: 6794 px conținut în 646 px vizibili).

## Comparația aceleiași componente la rezoluții diferite

Tabelul complet, generat, este în [report.md](report.md#comparația-aceleiași-componente-la-rezoluții-diferite).
Pe scurt, HUD-ul își schimbă lățimea 352 → 240 px la COMPACT, iar înălțimea reală crește de la 313,4 la
332,6 px pentru că textul se rupe pe mai multe linii; panoul profilului scade de la 416×648 la 384×432
și își păstrează scroll-ul intern. Fișierele `capture-hud-*.png` și `capture-profile-*.png` pun cele
cinci, respectiv cinci variante una lângă alta.

## Tastatura

Fiecare scenariu a fost parcurs cu **apăsări reale de Tab** (până la 14 tab stop-uri, oprire la
repetiție) și, pentru panourile modale, cu **Escape real**:

- HUD/flotă/notificări: 14 tab stop-uri, toate cu contur de 3 px; focusul intră pe `Detalii`, pe
  filtrele listei și pe rândurile de taxi.
- Panoul profilului: un singur tab stop (`Checksum și dovezi`), iar Tab se învârte în panou.
- Tabloul orașului: 4 tab stop-uri (rândurile de incident), prinse în dialog.
- Setările: 3 tab stop-uri (unități, cameră, grafică), prinse în dialog.
- Reglajele camerei: 4 tab stop-uri (preseturile și sliderul), prinse în dialog.
- Pop-up KPIs: 2 tab stop-uri (corpul derulabil + „Închide”), prinse în dialog.
- **Escape** a închis dialogul și a readus focusul în toate cele 6 scenarii modale (profil, tablou,
  setări, cameră, KPIs).
- Containerele derulabile devin tab stop-uri în Chromium și au conturul implicit `auto 1px`, nu
  conturul de 3 px al proiectului; sunt raportate ca observație, nu blochează criteriul, pentru că nu
  sunt controale ale panoului.

## Zoom

- **150%** pe 1280×720 → 853×480: HUD, minimapă, listă, notificări și toate panourile rămân în viewport,
  fără suprapunere critică și fără text tăiat.
- **200%** pe 1920×1080 → 960×540: idem, PASS pe toate cele 5 scenarii măsurate.
- **200%** pe 1280×720 → 640×360: **eșec** — vezi D1–D3. Coloana flotei începe la y=380 într-un viewport
  înalt de 360 px, deci iese complet sub marginea de jos, iar notificările depășesc cu 24 px. Cauza este
  contractuală, nu de conținut: `.fleet-panel` are `top: inset + hud-reserve + gap`, cu
  `--layout-hud-reserve: 22rem` (352 px) chiar și în COMPACT, deci pragul de 6rem al listei nu mai poate
  fi atins pe un viewport de 360 px.

## Findings (defecte reale, raportate nu reparate)

| ID | Componentă | Nivel | Defect |
| --- | --- | --- | --- |
| D1 | HUD + flotă + notificări | STRESS | La 640×360 coloana flotei (y=380…476) și notificările (până la 384) ies sub viewport. |
| D2 | Lista flotei | STRESS | Același caz: lista de 30 de taxiuri nu este vizibilă deloc, deși rândurile rămân în ordinea de tab. |
| D3 | Panoul profilului | STRESS | Același caz: fundalul (flotă + notificări) iese din viewport când panoul e deschis. |
| D4 | Reglajele camerei (229) | CONTRACT | `.control-sliders__ends` și `.control-sliders__note` au `font-size: 0.72rem` = **11,52 px**, sub pragul de 12 px al 084. |
| D5 | Pop-up KPIs (210) | CONTRACT | Etichetele grupurilor de grafic au `0.6875rem` = **11 px**, sub pragul de 12 px. |
| D6 | Pop-up KPIs (210) | CONTRACT | Valoarea `fără review-uri` are 36 px de text într-o coloană de 14 px (`overflow: visible`), deci se suprapune peste grupurile vecine; 4 apariții per captură. |
| D7 | Pop-up KPIs (210) | CONTRACT | Aceleași două defecte (11 px + suprapunere) la 1920×1080. |
| D8 | Pop-up KPIs (210) | CONTRACT | Idem, măsurat separat pentru captura LARGE. |

Pașii de reproducere pentru fiecare finding, cu captura și verificarea exactă, sunt în
[report.md](report.md#findings). Comanda care le reexecută: `npm run qa:ui -- --browser`.

**Constatare suplimentară, neblocantă**: la COMPACT (853×480 și 960×540) minimapa reală are ~227 px
înălțime pentru că textul de stare se rupe pe trei linii, iar `.learning-notifications` este poziționată
la `inset + 10rem + 4rem` (240 px); rezultatul este o suprapunere tranzitorie de ~3 px între cele două
suprafețe (`minimap × notifications`, 160×3,14 px). Este marcată `transient` conform modelului 084 și
nu blochează verdictul, dar merită corelată cu D1–D3 într-un PBI viitor.

## Comenzi executate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (exit 0, `src` + `tests`) |
| `npm run lint` | PASS (exit 0, 0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | vezi raportul final al PBI-ului (suita completă, numere reale) |
| `node --import ./scripts/register-typescript.mjs --test "tests/ui/ui-qa.test.ts"` | 22 teste, 22 trecute, 0 eșuate |
| `npm run qa:ui` | 22 capturi, 308 verificări, 300 trecute, 8 eșuate, 8 findings |
| `npm run qa:ui -- --check` | „UI QA report is current” + „UI QA markdown is current” |
| `npm run qa:ui -- --browser` | Chromium 156.0.8078.4, 22 capturi scrise, 3 203 570 octeți |
| `npm run qa:ui -- --strict` | exit 1 (5 findings CONTRACT), exact cum e documentat |

## Fișiere atinse

- `tests/ui/ui-qa.ts` (nou), `tests/ui/ui-qa.test.ts` (nou)
- `tests/browser/qa-ui-153/index.html`, `tests/browser/qa-ui-153/main.ts` (nou)
- `scripts/run-ui-qa-report.mjs` (nou)
- `package.json` (intrarea `qa:ui`, ultima din `"scripts"`)
- `Docs/18-validare-si-release.md` (secțiune nouă la final)
- `Docs/Evidence/153-ui-qa/` (acest README, `report.json`, `report.md`, `measurements.json`, 22 PNG)
- `PBI/In Progress/153-qa_ui.md` → `PBI/Done/153-qa_ui.md`

## Limitări

- **Browserul este Chromium headless**, nu GPU: capturile dovedesc layout, text, focus și scroll pe CSS-ul
  real, dar nu măsoară FPS, cost GPU sau senzația de condus. Playtestul rămâne al gate-urilor 159/224/235.
- **Zoomul este reprodus prin viewport-ul CSS efectiv** (`width / zoom`), exact ce văd media query-urile;
  Playwright nu are comutator de zoom de browser. 150% pe 1280×720 este capturat la 853×480, iar 200% pe
  1920×1080 la 960×540.
- **Camera 3D nu este randată**: pagina montează suprafețele HUD/panourilor care dețin camera (modul
  CHASE/FIRST_PERSON din setări, sliderii de confort/FOV din 229), dar scena Babylon, unghiurile de
  cameră și recentrarea rămân verificate de teste ale modulelor 017/027/229, nu de această captură.
- **Trei controale esențiale sunt ale hostului**, nu ale `src/ui`: butoanele M/L (067, fără reguli în
  `src/style.css`), pauza (meniul aplicației) și recuperarea (`createRecoveryHud`, montat de host în
  containerul lui). Sunt declarate `OWNER_OUTSIDE_QA_HARNESS` cu motiv în fiecare măsurătoare; viteza și
  starea minimapei sunt măsurate direct.
- **Panourile neincluse în scenă**: istoricul profilului (078), remaparea tastelor (080), misiunile
  (126/212), comparația A/B (143), tutorialul și sliderii de stil (230). Sunt acoperite de testele și
  dovezile lor; 153 verifică suprafețele cele mai expuse în timpul condusului.
- **Nu acoperă** `forced-colors`, cititoare de ecran, zoom text-only sau input fizic uman; politicile
  083/084 rămân sursa pentru contrastul declarat, iar 235 rămâne gate-ul integrat.
