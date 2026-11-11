# PBI 210 — popup KPIs și grafice istorice

Generat de `npm run kpi:history`; contract `210-kpi-history-v1` + `210-kpi-history-popup-v1`.
Ceas economic `209-economy-clock-v1`, fereastră 12 luni, plafon 60 puncte/zi.

## Istoric

- settle-uri/review-uri: 310/284
- luni: 12 (11 cu date, 1 fără date, 1 parțiale, 10 încheiate)
- puncte exacte/vizuale: 310/52, downsampled: true
- revenue: 31960 SDA; curse terminale: 310; review-uri: 284
- media ponderată: 2.552817 (ratingSum 725 / 284); media mediilor lunare: 2.5
- distribuția 0–5: 49, 45, 45, 45, 45, 55
- proiecție: PROJECTED, 3483 SDA din 10800.15 s observate
- historyScans înainte/după: 0/0

## Popup

- elemente/noduri text: 1369/748
- listeners: 3 (globali: 0)
- deschideri/închideri/randări/citiri: 1/1/1/1
- bare/rânduri de tabel: 175/70
- grafice: MONTH_REVENUE, DAILY_RIDES, DAILY_REVIEWS, DAILY_RATING, RATING_DISTRIBUTION
- tabele: months, days, distribution
- focus mutat/restaurat, Escape: 1/1/1

## Verificări

| Rezultat | Verificare | Real | Așteptat | Notă |
| --- | --- | --- | --- | --- |
| PASS | closed-panel-reads-nothing | SKIPPED_CLOSED/0/0 | SKIPPED_CLOSED/0/0 | Un panou închis nu citește KPI-ul și nu reconstruiește grafice. |
| PASS | open-reads-once | 1/1 | 1/1 | Deschiderea citește read model-ul o singură dată. |
| PASS | kpi-never-rescans | 0/0/0 | 0/0/0 | Ledgerul nu este rescadat nici înainte, nici după deschidere. |
| PASS | ledger-counts-stable | 310/284 | 310/284 | Citirea popup-ului nu adaugă settle-uri sau review-uri. |
| PASS | twelve-month-window | 12/12/0 | 12/12/0 | Fereastra acoperă exact 12 luni simulate, inclusiv golurile. |
| PASS | missing-month-is-not-zero | NO_DATA/fără date/1 | NO_DATA/fără date/1 | Luna fără date este „fără date”, nu 0 și nu medie inventată. |
| PASS | real-zero-month | 0/0/0 SDA | 0/0/0 SDA | Un zero real rămâne 0 și își păstrează eșantionul de 4 review-uri. |
| PASS | partial-month-not-compared | PARTIAL/PROJECTED/3483 | PARTIAL/PROJECTED/valoare diferită de efectiv | Luna curentă este parțială și are proiecție separată, nu o comparație cu o lună încheiată. |
| PASS | weighted-average | 725/284=2.552817 | ratingSum/reviewCount | Media ferestrei este raportul sumelor exacte. |
| PASS | mean-of-means-differs | 2.5 vs 2.552817 | diferență > 0.01 | Media mediilor lunare ar fi greșită; dovada arată că nu este folosită. |
| PASS | distribution-exact | 49,45,45,45,45,55=284 | 49,45,45,45,45,55=284 | Histograma 0–5 însumează exact review-urile ferestrei. |
| PASS | no-review-day-has-no-mean | 26 zile fără review-uri | 26 zile fără medie | O zi cu curse dar fără review-uri nu primește medie. |
| PASS | downsampling-visual-only | 310→10, 31960/31960, 284/284 | 310→10, sums equal | Gruparea este doar vizuală; sumele rămân exacte. |
| PASS | grouped-average-weighted | 2.419355 | 2.419355 | Media unui grup este calculată din sumele membrilor. |
| PASS | projection-sample | 10/300/10800.15 | 10/300/≥300 | Proiecția păstrează pragurile publicate de 209. |
| PASS | charts-present | 5/12/52 | 5/12/60 | Revenue, curse/zi, review-uri/zi, media/zi și distribuția sunt proiectate din valori. |
| PASS | month-table | 12/7 | 12/7 | Tabelul lunar are un rând stabil pentru fiecare lună, inclusiv golul. |
| PASS | exact-tables | 52/6 | 52/6 | Tabelul zilnic și histograma accesibilă păstrează valorile exacte. |
| PASS | native-trigger-and-dialog | button/button/dialog | button/button/dialog | Butonul este nativ, iar popup-ul are rol și nume accesibil. |
| PASS | focus-and-escape | true/true/true/true/1 | true/true/true/true/1 | Focusul intră în popup, Tab rămâne înăuntru, Escape îl închide și readuce focusul. |
| PASS | target-resolution-fit | 928x648@1280x720, 928x736@1920x1080, 785.06x432@853x480 | încadrare cu scroll intern la toate rezoluțiile țintă | Dialogul are lățime/înălțime maxime în vw/rem și scroll intern, deci se încadrează la 1280×720, 1920×1080 și 853×480. |
| PASS | pause-manual-round-trip | true/panel/false/MANUAL | true/panel/false/MANUAL | MANUAL este suspendat la deschidere și revine exact la starea anterioară la închidere. |
| PASS | auto-stays-live | false/null/0 | false/null/0 | În observare AUTO popup-ul nu suspendă simularea. |
| PASS | no-global-listeners | 0/3 | 0/3 | Niciun listener pe window/document; doar butonul, Închide și dialogul. |
| PASS | empty-source-explicit | true/0 | true/0 | Fără economie, popup-ul spune explicit că nu există date. |
| PASS | deterministic-transcript | equal | equal | Două scenarii identice produc aceeași selecție și aceeași semnătură a popup-ului. |

Rezumat: 26/26 verificări, overall PASS.
Determinism: 2 rulări, equal=true.

## Limitări

- Nivel `targeted`: raportul dovedește costul structural al popup-ului (zero citiri/randări când este închis) și bugetul de scriere al HUD-ului; nu este o probă FPS/GPU pe hardware real.
- Stilurile popup-ului sunt inline, ca să nu modifice foaia globală în afara ownership-ului PBI 210.
- Butonul K și montarea în panoul flotei rămân ale hostului; popup-ul expune `open()` pentru bindingul de input existent.