# Checklist-ul executat al release-ului V1 (PBI 162)

Comandă: `npm run release:checklist` (13 verificări, 0 eșuate). Verdict agregat: **NOT_VALIDATED**.

Release-ul **nu** se declară gata: 2 criterii FAIL, 1 NOT_VALIDATED, 2 NOT_RUN. Lista deschisă de mai jos este exhaustivă și nu conține estimări.

## Criterii

| # | Criteriu | Verdict | Comandă | Rezultat real |
| --- | --- | --- | --- | --- |
| 1 | Toate dependențele V1 sunt în Done și au dovezi comise, fără placeholder | `PASS` | `citire PBI/Done + Docs/Evidence (fără execuție)` | 10/10 dependențe cu fișier în Done și dovezi fără placeholder |
| 2 | Verificările statice obligatorii trec pe revizia curentă | `PASS` | `npm run typecheck / lint / format:check / check:architecture / check:parameter-catalog / assets:manifest -- --check` | 6/6 pași cu exit 0 |
| 3 | Suita completă de teste trece fără eșecuri | `PASS` | `npm test` | 2 898 teste, 2 898 trecute, 0 eșuate, 0 sărite |
| 4 | Boardul PBI este valid și 162 apare într-o singură coloană | `PASS` | `pwsh ./PBI/Validate-Board.ps1` | Valid true, Total 235, 162 în 1 coloană |
| 5 | Pipeline-ul CI 160 a rulat pe această revizie, cu livrare statică verificată | `PASS` | `npm run ci:verify` | banda verify: PASSED_WITH_PLAN_DEBT, 12 pași (0 eșuate), gate structural PASS, livrare STATIC_VERIFIED |
| 6 | Gate-ul de performanță și soak 224 trece structural, fără să ascundă FPS-ul | `NOT_VALIDATED` | `npm run perf:gate -- --check` | 17 rânduri: 16 PASS, 0 FAIL, 1 NOT_VALIDATED (fps-hardware); structural PASS, release NOT_VALIDATED |
| 7 | Gate-ul de experiență și revenire 235 are verdict executat pe toate criteriile | `FAIL` | `npm run qa:fun -- --check` | 6 criterii: 4 PASS, 1 FAIL (C3), 1 NOT_RUN (C5); 16 sonde: 15 PASS, 1 FAIL; playtest NOT_RUN 0/5 |
| 8 | QA vizual și accesibilitate 153 nu are eșecuri de contract | `FAIL` | `npm run qa:ui -- --check` | 22 capturi, 308 verificări, 300 trecute, 8 eșuate (5 de contract), 8 findings |
| 9 | Matricea de compatibilitate 154 acoperă WebGPU și WebGL 2 și declară ce nu a rulat | `PASS` | `npm run qa:compat -- --check` | 9/9 combinații reale, 11/11 verificări deterministe, 11 combinații declarate NOT_RUN |
| 10 | Artefactul de livrare (build de producție + manifest) este reproductibil și servit static | `PASS` | `npm run build:report -- --check` | 130 artefacte, 6 172 078 B (5.89 MiB), JS+WASM 6 125 279 B = 73.02 % din capacitate, gzip 1 769 518 B, arbore SHA-256 81e33b1d8c54a53b97087288dac3b7cf1f9f833f66eef07b108a23dc2042d3a9, 132 cereri HTTP, 130 payloaduri verificate |
| 11 | Documentația de release este coerentă, iar linkurile din fișierele atinse se rezolvă | `PASS` | `citire Docs/18 + Docs/manual + Docs/README.md + verificare de linkuri` | 11 fișiere, 43 linkuri locale, 0 rupte; index: 18 prezent, manual prezent |
| 12 | Demonstrație completă pe hardware-ul agreat (GPU real, OS/browser de referință) | `NOT_RUN` | `demonstrație manuală pe hardware agreat` | 0 rulări pe hardware agreat; pe această mașină au rulat doar probe Node și Chromium headless pe SwiftShader |
| 13 | Playtest uman cu minimum cinci participanți și sesiune de revenire | `NOT_RUN` | `sesiune de playtest cu observator` | 0/5 participanți; retenție 24 h / 7 zile nemăsurată |

## Verificări executate

| Pas | Comandă | Exit | Status |
| --- | --- | --- | --- |
| typecheck | `npm run typecheck` | 0 | `PASS` |
| lint | `npm run lint` | 0 | `PASS` |
| format | `npm run format:check` | 0 | `PASS` |
| architecture | `npm run check:architecture` | 0 | `PASS` |
| parameter-catalog | `npm run check:parameter-catalog` | 0 | `PASS` |
| tests | `npm test` | 0 | `PASS` |
| board | `pwsh -NoProfile -ExecutionPolicy Bypass -File PBI/Validate-Board.ps1` | 0 | `PASS` |
| assets:manifest | `npm run assets:manifest -- --check` | 0 | `PASS` |
| perf:gate | `npm run perf:gate -- --check` | 0 | `PASS` |
| qa:fun | `npm run qa:fun -- --check` | 0 | `PASS` |
| qa:ui | `npm run qa:ui -- --check` | 0 | `PASS` |
| qa:compat | `npm run qa:compat -- --check` | 0 | `PASS` |
| build:report | `npm run build:report -- --check` | 0 | `PASS` |

## Dependențe V1

| PBI | Titlu | În Done | Dovezi | Verdict | Detaliu |
| --- | --- | --- | --- | --- | --- |
| 161 | Manual de utilizare și operare | da | `Docs/Evidence/161-release-docs/README.md` | `PASS` | dovadă de documentație (README/report) |
| 154 | Matrice de compatibilitate WebGPU/WebGL 2 | da | `Docs/Evidence/154-compat-matrix/report.json` | `PASS` | 9 rânduri: 9 PASS, 0 FAIL, 0 NOT_RUN, 11 declarate NOT_RUN |
| 152 | Sesiune integrală și progres | da | `Docs/Evidence/152-e2e-session/report.json` | `PASS` | 11 pași, 104 verificări, 0 eșuate |
| 108 | Gate learning 24 de parametri | da | `Docs/Evidence/108-learning-gate24/report.json` | `PASS` | 7 scenarii, 48 trecute, 0 eșuate, 0 NOT_RUN |
| 039 | Zone de trecere | da | `Docs/Evidence/039-crosswalk-zones/report.md` | `PASS` | dovadă de documentație (README/report) |
| 076 | Selecție hartă | da | `Docs/Evidence/076-map-selection/report.json` | `PASS` | 43/43 verificări |
| 141 | Replay de incidente | da | `Docs/Evidence/141-experiment-replay/report.json` | `PASS` | 74/74 verificări |
| 216 | Regresia V1: moduri, KPI, daily, XP | da | `Docs/Evidence/216-v1-regression/report.json` | `PASS` | 29 rânduri: 27 PASS, 0 FAIL, 2 NOT_RUN |
| 217 | Trei moduri de control | da | `Docs/Evidence/217-three-modes/report.json` | `PASS` | 28/28 verificări |
| 235 | Gate de experiență și revenire | da | `Docs/Evidence/235-fun-qa/report.json` | `PASS` | 6 criterii: 4 PASS, 1 FAIL, 1 NOT_RUN; 16 sonde |

## Artefactul de livrare

- 130 artefacte, 6 172 078 B (5.89 MiB), gzip 1 769 518 B.
- JS+WASM: 6 125 279 B = 73.02 % din 8 388 608 B.
- Arbore SHA-256 `81e33b1d8c54a53b97087288dac3b7cf1f9f833f66eef07b108a23dc2042d3a9`, reproductibil: da; `index.html` SHA-256 `3052f5e2cc4334639c2aa2f916119fac5da561256c2842bd7e1e6d60e147f2b3`.
- Livrare statică: 132 cereri HTTP, 130 payloaduri verificate, 0 eșuate.
- Manifestul complet: [report.json al 160](../160-build-delivery/report.json); sinteza: [artifact.json](artifact.json).

## Ce rămâne deschis

| Sursă | ID | Verdict | Motiv |
| --- | --- | --- | --- |
| 151 | integration-browser-playtest | `NOT_RUN` | Playtest în browser: explicații, senzație de condus și HUD |
| 153 | D1 | `FAIL` | MEDIUM surface-inside-viewport (hud@zoom-200-720): A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).) |
| 153 | D2 | `FAIL` | MEDIUM surface-inside-viewport (fleet@zoom-200-720): A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).) |
| 153 | D3 | `FAIL` | MEDIUM surface-inside-viewport (profile@zoom-200-720): A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).) |
| 153 | D4 | `FAIL` | MEDIUM text-legible (camera@1280x720): Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11.52 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.) |
| 153 | D5 | `FAIL` | MEDIUM text-legible (kpis@1280x720): Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.) |
| 153 | D6 | `FAIL` | MEDIUM text-not-clipped (kpis@1280x720): Visible text overflows or is clipped by its own box. (4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".) |
| 153 | D7 | `FAIL` | MEDIUM text-legible (kpis@1920x1080): Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.) |
| 153 | D8 | `FAIL` | MEDIUM text-not-clipped (kpis@1920x1080): Visible text overflows or is clipped by its own box. (4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".) |
| 154 | android-chrome | `NOT_RUN` | Nu există dispozitiv Android; suportul WebGPU mobil rămâne nevalidat. |
| 154 | chrome-stable | `NOT_RUN` | Nu există o instalare Chrome stable separată; Chromium 156 din Playwright este singurul runtime. |
| 154 | chromium-headless-webgpu | `NOT_RUN` | Chromium headless nu expune un adapter WebGPU utilizabil; pe această configurație se verifică doar fallback-ul WebGL 2 software. |
| 154 | edge-stable | `NOT_RUN` | Canalul Edge stable nu este instalat; Chromium de test acoperă motorul, nu integrarea Edge. |
| 154 | firefox-stable | `NOT_RUN` | Runtime Firefox nu este instalat în ms-playwright (există doar chromium-1248); nu a fost rulat. |
| 154 | ios-safari | `NOT_RUN` | Nu există dispozitiv iOS; WebGPU și fallback-ul pe WebKit mobil rămân nevalidate. |
| 154 | linux-vulkan | `NOT_RUN` | Nu există hardware Linux; driverul Vulkan și compozitorul nu pot fi verificate aici. |
| 154 | macos-metal | `NOT_RUN` | Nu există hardware macOS; WebGPU pe Metal și fallback-ul WebGL 2 nu pot fi rulate aici. |
| 154 | webkit-safari | `NOT_RUN` | Runtime WebKit nu este instalat, iar Safari nu există pe Windows. |
| 154 | windows-intel | `NOT_RUN` | Nu există GPU Intel pe mașină. |
| 154 | windows-nvidia | `NOT_RUN` | Mașina are un iGPU AMD; nu există GPU NVIDIA pentru proba driverului proprietar. |
| 216 | C3 | `NOT_RUN` | Nu s-a rulat un browser real sau input uman. Nivelul atins este `targeted`, cu scenarii deterministe în Node; playtestul rămâne pentru gate-ul 235. |
| 216 | C4 | `NOT_RUN` | Suita nu are renderer, GPU sau browser; bugetul de cadru rămâne al gate-urilor 220/224/155. Nu se raportează FPS headless. |
| 224 | fps-hardware | `NOT_VALIDATED` | capturile hardware 220 din Docs/Evidence/155-hardware-budget/report.json sunt pe buildul 2d68b43c8cdf; revizia curentă este 757e7168dfd6. Pragurile absolute FPS/GPU (35 ms p95, 28 ms GPU) cer aceeași revizie, deci FPS rămâne NOT_VALIDATED până la o rulare pe hardware real al acestei revizii. |
| 235 | C3 | `FAIL` | HUD/camera first-person și sliderele sunt confortabile în două clase și accesibile la 1280×720; feedbackul destructibil este verificat vizual/audio |
| 235 | C5 | `NOT_RUN` | Playtest cu minimum cinci participanți acoperă condus liber, prima schimbare de stil, distrugere și reluarea unei provocări; consemnează cine reîncearcă spontan și de ce |
| 235 | playtest | `NOT_RUN` | 0/5 participanți; 4 fluxuri neacoperite de oameni |

## Cum se închide

1. FPS, frame p95/p99 și lucrul GPU pe hardware real, pe aceeași revizie și pe ambele backenduri (gate 224).
2. Repararea defectelor de text din 153 (C3 al gate-ului 235), într-un PBI care deține `src/ui`.
3. Playtest uman cu minimum cinci participanți și o sesiune de revenire la 24 h / 7 zile (235).
4. Demonstrația pe hardware-ul agreat, cu GPU real și cealaltă combinație OS/browser (matricea 154).

