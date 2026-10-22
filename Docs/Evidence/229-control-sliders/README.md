# 229 — popup cu slidere pentru control și confort

Dovezile pentru PBI 229: contractul popup-ului „Reglaje”, tabul „Cum controlez mașina”, draftul
aplicat la tick, versiunea de control în telemetrie și verificarea vizuală la 1280×720.

- Cod: `src/ui/control-sliders-format.ts` (contract pur), `src/ui/control-sliders.ts` (adaptor DOM),
  `src/app/control-sliders.ts` (sesiunea popup + publicarea la tick), `src/style.css` (stilurile).
- Teste: `tests/ui/control-sliders.test.ts`, `tests/app/control-sliders.test.ts`,
  `tests/ui/control-sliders-fixture.ts`.
- Raport determinist: [report.json](report.json) și [report.md](report.md).
- Playtest: [playtest.json](playtest.json) și capturile `capture-*.png`.

## Contract livrat

| Aspect | Contract |
| --- | --- |
| Tab control | 7 slidere native (`input[type=range]`): sensibilitatea direcției, revenirea volanului, direcție calmă la viteză, accelerație progresivă, frânare progresivă, mișcarea camerei, câmp vizual (60–100°) |
| Capete și valori | fiecare slider are două cuvinte simple la capete („Lină/Directă”, „Lentă/Rapidă”, „Stabilă/Mobilă”, „Îngust/Larg”), valoarea afișată („70 / 100”, „80°”) și `aria-valuetext` |
| Tastatură | slider nativ: ArrowLeft/Right/Down/Up pas 1, PageDown/PageUp pas 10, Home/End la capete; Tab/Shift+Tab în buclă în dialog; Escape închide; toate butoanele au `type="button"` |
| Preseturi | Accesibil / Echilibrat / Direct, toate în domeniile 009, `aria-pressed` reflectă presetul activ |
| Tab oraș | „Cum conduce orașul · Indisponibil · 230” (dezactivat, `data-reason=PBI_230_PENDING`); editorul de stil rămâne la 230 |
| Draft | mișcarea sliderului scrie doar citirea locală, cel mult 10 Hz; o singură revizie de draft la eliberarea gestului; niciun clic nu scrie setările |
| Aplică | închide popup-ul, reia ceasul și publică o singură dată la primul tick: `input.control.version` +1, filtru 025 pentru acel tick, `CONTROL_PREFERENCES_CHANGE` în 069 (segment închis/redeschis, `learningEpoch` neschimbat) |
| Anulează | retrage o aplicare în așteptare și revine la valorile salvate; nu scrie nimic |
| Revino la valorile inițiale | cere confirmare, propune doar draftul 009 (bindings, mapping și revizia rămân) |
| Pauză/input | popup = suprafață `menu` la 070: suspendă AUTO/MANUAL/LEARNING, eliberează comenzile ținute la deschidere și la reluare |
| Focus | focusul intră în dialog, se restaurează la închidere; `globalListeners = 0`; contrast WCAG AA pe tokenii 083 |
| Layout | 1280×720: lățime 416 px, înălțime max 648 px, 4 rânduri vizibile, lista derulează, footerul fix sub listă |

## Verificări executate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0, `--max-warnings 0`) |
| `npm run format:check` | PASS (exit 0) |
| `npm run check:architecture` | PASS (257 fișiere TypeScript, toate probele negative) |
| `npm test` | PASS 1832/1832 teste |
| `node --import ./scripts/register-typescript.mjs scripts/run-control-sliders-report.mjs` | PASS 53/53 checks, 8 scenarii, `overall PASS` |
| `... scripts/run-control-sliders-report.mjs --check` | `Control sliders report is current` (exit 0) |
| Playtest Chromium 156.0.8078.4 headed, 1280×720 | PASS 31/31 checks, 0 page errors, `playtest.json` |

Raportul determinist acoperă: domeniile și capetele, cele trei preseturi, draft/aplică/anulează/reset,
eroarea de domeniu raportată (nu limitată silențios), plafonarea scrierilor, `NOT_DUE`/`APPLIED`,
revizia +1, păstrarea bindingurilor și a scenariului, segmentul 069 închis cu
`CONTROL_PREFERENCES_CHANGE` și redeschis cu versiune nouă, `learningEpoch` neschimbat, pauza `menu`,
eliberarea inputului, extremele pe sedan/compact cu mecanica 023 neschimbată și camera la FOV 60/100°.

Sonda locală de cost (în `tests/ui/control-sliders.test.ts`): 600 apeluri `update()` identice la 60 Hz
produc 0 scrieri DOM și 0 randări suplimentare, în ~11 ms total (~0,018 ms/apel). Popup-ul nu
înregistrează niciun `requestAnimationFrame`, niciun listener global și nu face lucru pe frame;
singurele scrieri periodice sunt citirile sliderului, plafonate la 10 Hz.

## Playtest în browser (1280×720, Chromium headed)

Pagina de playtest compune popup-ul real, proprietarul 070 real, store-ul 009 real și sesiunea 229
reală (`tests/browser/control-sliders/index.html`). Două adaptoare sunt locale paginii și NU sunt
contracte de producție: oglinda setărilor în `localStorage` (pentru scenariul de reload) și bucla de
tick care îngheață cât timp popup-ul suspendă lumea.

| Scenariu | Ce s-a văzut | Captură |
| --- | --- | --- |
| Deschidere la 1280×720 | popup 416×648 px în viewport, 7 slidere, 2 taburi, 3 preseturi, lista derulează (245 px vizibili din 754), footer fix sub listă, focus pe primul tab, ceasul îngheață (`tick 5 → 5`, `suspended=true`), input eliberat 1× | `capture-01-open-default-1280x720.png` |
| Preset Direct | toate cele 7 valori devin 80/40/25/75/35/60/88, `aria-pressed=true`, Aplică activat | `capture-02-preset-direct.png` |
| Tastatură pe slider | Home → 0, ArrowRight ×2 → 2, End → 100; inel de focus vizibil | `capture-03-keyboard-slider.png` |
| Extreme | toate cele 7 slidere la maximum (100; FOV 100°), lista derulată până la FOV, valorile afișate corect | `capture-04-extremes-max.png` |
| Aplică | popup închis, ceasul repornește (tick 31), versiunea control 3 → 4, segment la tick 6 `["playtest-229","025-keyboard-v1",3] → …,4` cu `CONTROL_PREFERENCES_CHANGE`, valoarea persistată | `capture-05-applied-resumed.png` |
| Anulează | draftul revine la valorile salvate, Aplică dezactivat, versiunea rămâne 4 (nicio scriere) | `capture-06-cancel.png` |
| Escape | popup închis, ceasul repornește, focusul revine pe butonul gazdă | `capture-07-after-escape.png` |
| Reload | versiunea 4 și valorile 100 se păstrează; popup-ul redeschis arată valorile salvate, Aplică dezactivat | `capture-08-reload-persisted.png` |
| Tab trap | 6 × Tab rămân în dialog; `globalListeners=0`, `writeHz=10` | `capture-09-tab-trap.png` |

## Limitări

- Playtestul nu rulează jocul complet (fără renderer, fizică sau bucla reală de telemetrie): 069 este
  compus în raport cu lifecycle-ul real pe fixture determinist, iar pagina de playtest doar
  înregistrează obiectul real `CONTROL_PREFERENCES_CHANGE` la tick. Performanța jocului integrat
  rămâne la gate-urile 220/224/235.
- Persistența între reload este o adaptare locală a paginii de test (`localStorage`); 009 expune
  store-ul, iar portul de salvare per jucător rămâne al integrării de persistență.
- Popup-ul nu este înregistrat în `PANEL_SURFACES` din 083 (ar schimba numărătoarea și raportul
  083). Refolosește selectorul, regula de contrast și pragurile 083 și își publică propriul audit în
  `report.json`; înregistrarea în 083 poate fi făcută la 235, când se validează fluxul complet.
- La zoom 150% (~853×480 efectiv) rămân 2 rânduri vizibile și lista derulează; contractul cere
  minimum 2 rânduri în COMPACT, footerul rămâne vizibil.
