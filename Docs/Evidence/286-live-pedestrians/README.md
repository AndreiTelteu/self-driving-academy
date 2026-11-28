# 286 — Pietoni, treceri și pericole în lumea live

Contractul `286-live-pedestrian-hazards-v1` trăiește în
[`src/app/live-pedestrian-hazards.ts`](../../../src/app/live-pedestrian-hazards.ts) și este singura
punte dintre patru proprietari deja livrați: populația 164, stimulii 165, lumea Rapier 282 și
vocabularul V2 163. Nu există o a doua simulare, un al doilea ledger, un al doilea solver sau un al
doilea store de pietoni.

## Ce este real

- **Populația.** 48 de legături derivate pe 80 de treceri autorate; 96 de pietoni cu ID stabil,
  traseu pe trotuarul 042 și faza `ON_SIDEWALK → WAITING → CROSSING → CROSSED → WITHDRAWN`.
  32 de treceri sunt refuzate de 164 cu `NO_SIDEWALK` și rămân raportate ca lacună.
- **Yield dovedit prin ordine reală.** În raport, conflictul începe la tick 197, iar oprirea fizică
  apare la tick 284, în timpul traversării, la 9.68 m de linia de conflict. Conflictul este
  `YIELDED`; nu există text de HUD în lanțul dovezii.
- **Pieton neobservat.** Aceeași scenă cu `observableVehicle = false` produce 0 opriri, 0 yield-uri,
  92 de traversări `UNOBSERVED` și `YIELD_RATE = MISSING`.
- **Pericol în aceeași fizică.** Obstacolul este o cutie numită în lumea 282 (`added = 1`,
  `active = 1`). Reacția este un front real de comandă (`BRAKE`, latență 197 tick-uri), iar mașina
  trece la 4.03 m de centrul obstacolului, fără contact și fără incident.
- **Context V2.** Faptele live produc `PEDESTRIAN`, `OBSTACLE`, `BRAKE_INPUT`,
  `LONGITUDINAL_ACCEL` și cheile `pedestrian_yield_probability`, `pedestrian_clearance`,
  `hazard_reaction_delay` în scenariul `HAZARDS` din 163.
- **Cost.** 96 de pietoni + 96 de obstacole de date, 600 pași: raportul determinist păstrează
  numărătorile (peste 50.000 de evaluări de pietoni și 100.000 de evaluări de pericole); timpii
  p50/p95 sunt în `cost.json`, iar costul nativ Rapier rămâne al lui 282.

## Comenzi

- `npm run pedestrians:live` scrie [`report.json`](report.json) și [`report.md`](report.md);
  `-- --check` refuză un raport neactualizat.
- `npm run pedestrians:live:cost` scrie [`cost.json`](cost.json) și [`cost.md`](cost.md). Costul
  de ceas este o măsurătoare, nu o valoare deterministă; raportul determinist păstrează doar
  contoarele structurale.
- `npm run pedestrians:live:probe` rulează fixture-ul de browser în Chrome și scrie
  [`browser.json`](browser.json), [`browser.md`](browser.md) și capturile din
  [`screenshots/`](screenshots/). Fără Playwright rezultatul este `NOT_RUN`, niciodată un PASS
  fabricat.

## Dovezi de browser

Proba a rulat pe Chromium 157.0.8103.51, viewport 1100×620, cu `--disable-frame-rate-limit`.
Capturile arată:

- [`pedestrian-crossing.png`](screenshots/pedestrian-crossing.png) — pietoni pe trecere, mașina
  apropiindu-se;
- [`physical-yield.png`](screenshots/physical-yield.png) — 0.17 m/s, frână 1.00, `YIELDED` la tick
  181, oprire în timpul traversării;
- [`obstacle-approach.png`](screenshots/obstacle-approach.png) — obstacolul fizic în fața mașinii;
- [`obstacle-avoidance.png`](screenshots/obstacle-avoidance.png) — `PASSED_CLEAR`, 3.17 m clearance,
  fără contact.

7/7 verificări de browser, 0 erori de pagină și 0 erori de consolă.

## Limitări

- 32 de treceri nu au trotuar derivat la ambele capete; 164 le refuză, iar raportul păstrează
  lacuna.
- Pietonii nu au collider Rapier în 282; un impact vehicul–pieton nu este inventat. Canalul de
  contact 164 rămâne disponibil când proprietarul coliziunilor îl va furniza.
- Fereastra fizică a pericolelor este mărginită de registry-ul 028 (clădirile ocupă deja 90 de
  sloturi); costul folosește 96 de obstacole de date fără 96 de corpuri native.
- Proba de browser este un fixture al aceleiași compuneri și al aceleiași fizici, nu o captură a
  shell-ului complet; FPS, GPU și heap-ul exact nu sunt pretinse.
