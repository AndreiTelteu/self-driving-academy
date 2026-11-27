# 267 — KPI, city dashboard și consecințe

Generat determinist de `npm run kpi:dashboard` peste read model-urile reale 209/210/214 și
compoziția reală 082/061/028/065. Nu măsoară timp de perete, FPS sau GPU.

| Rezultat | Verificare | Detaliu |
| --- | --- | --- |
| PASS | `twelve-month-window` | 12 luni în selecție, 12 rânduri în tabel |
| PASS | `partial-month-projection` | m0011 PARTIAL, proiecție PROJECTED, praguri 10/300 |
| PASS | `no-data-is-not-zero` | luna 3 NO_DATA null, luna 6 COMPLETE revenue 0 cu 30 curse |
| PASS | `weighted-rating-not-mean-of-means` | ponderat 2.552817, media mediilor 2.5 |
| PASS | `daily-points-and-distribution` | 310 zile exacte → 52 puncte, distribuție 49/45/45/45/45/55 |
| PASS | `closed-popup-reads-nothing` | SKIPPED_CLOSED, citiri 0, randări 0 |
| PASS | `open-reads-once-and-focuses` | 1 citire, focus în dialog, rol dialog |
| PASS | `tab-and-escape` | Tab true, Shift+Tab true, Escape 1, focus restaurat true |
| PASS | `closed-after-escape-reads-nothing` | 1 citiri după închidere, 1 închideri |
| PASS | `history-scans-stay-zero` | historyScans 0/0, settle 310→310, review 284→284 |
| PASS | `impact-three-planes-no-xp` | serviciu COMPARABLE, XP 0/0, misiune NONE |
| PASS | `impact-hud-10hz` | 600 tick-uri → 100 citiri, 2 randări, 4 scrieri |
| PASS | `city-seven-indicators` | 7 indicatori, 2 incidente, 1 citiri |
| PASS | `city-real-incidents` | COLLISION:id-v1:9:collision11:session:0653:0281:03:1:22:65, BLOCKAGE:blockage:city:082:traffic-block |
| PASS | `city-panel-escape-and-closed-read` | Escape true, citire când închis absentă |

Rezumat: 15/15 verificări, overall PASS.

- KPI: 12 luni (1 fără date), venit
  31960 SDA, 284 review-uri, medie ponderată
  2.552817 față de 2.5 media mediilor, distribuție
  49/45/45/45/45/55; 310 zile exacte → 52
  puncte; proiecție PROJECTED; popup 1 citiri /
  1 randări; `historyScans` 0.
- Impact: 600 tick-uri → 100 citiri,
  2 randări, 4 scrieri; XP
  0/0.
- Oraș: 4/7 indicatori
  disponibili, 2 incidente reale, 1 citiri ale
  panoului.
