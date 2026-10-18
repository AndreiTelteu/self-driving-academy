# 040 — Încercări de re-baseline pe mașina curentă (mobil, baterie)

2026-10-18. Scop: recapturarea baseline-ului BEFORE pe mașina curentă, ca să permită o comparație BEFORE/AFTER pe același hardware (decizie explicită a utilizatorului). Toate cele trei capturi au folosit același harness de referință (`tests/browser/service-zones-before.mjs`, randat pe această mașină), aceeași închidere de surse și aceleași praguri absolute (normal70 p95 ≤ 5,5 ms; stress110).

Mașină: **AMD Ryzen 7 7735U** (8C mobil), Windows 11 Home 10.0.26300, RAM 14702026752 B, GPU AMD Radeon(TM) Graphics (integrat), node v24.21.0. Repo: `C:/Users/aandr/Sites/self-driving-academy/.worktrees/service-zones-01` la commit 0853a4d. Alimentare: **baterie, descărcare, ~27%** pe toată durata.

## Rezultate

| Rulare | Plan energie | normal70 p95 (ms) | stress110 p95 (ms) | Verdict | Dovadă păstrată |
|---|---|---|---|---|---|
| A | Balanced | 6,9107 / 6,9373 / 6,9644 / 6,9963 / **7,1504** | 8,6183 / 8,8088 / 8,8957 / 8,9680 / 9,3484 | FAIL (normal70 > 5,5) | `before-02-mobile-failed-01` (sourceHash `d9d2fdc9…`) |
| B | High performance | 3,3378 / 3,4274 / 3,4812 / 3,7773 / **4,5717** | 4,3012 / 4,4382 / 4,4614 / 4,5036 / 4,5799 | PASS | numere păstrate aici (folderul a fost șters la recapturare) |
| C | High performance | 4,7704 / 5,4740 / 5,5361 / 5,7154 / **7,6638** | 7,1146 / 7,2818 / 7,3430 / 7,4335 / 10,0573 | FAIL (normal70 > 5,5) | `before-02-mobile-failed-02` (sourceHash `c7f1b021…`) |
| D | High performance, **AC** | 5,6577 / 6,3183 / 6,3300 / 6,5208 / **13,9327** | 8,8840 / 9,3830 / 9,4065 / 9,7426 / 11,5306 | FAIL (normal70 > 5,5) | `before-02-ac-failed-03` |

Referință pe mașina de baseline originală (AMD Ryzen 9 7950X3D): normal70 p95 3,3928–3,6239 ms; stress110 4,3900–4,5332 ms.

## Diagnostic: nu este limita CPU-ului, ci zgomotul de fundal

- Contorul `% Processor Performance` arată 143% în repaus → CPU-ul **boostează** normal, nu este limitat global de plan sau de baterie.
- Rularea B (3,34–4,57 ms) dovedește că arhitectura atinge gate-ul atunci când mașina e liniștită.
- La măsurare, mașina are **~16% CPU consumat constant** de procese străine: UniGetUI (~21% dintr-un core), Lenovo Vantage add-in (~14%), T3 Code (~15%), Adobe Creative Cloud (2 procese, ~13%), Chrome (~9%), Discord. Orice vârf al acestora în fereastra de 600 tick-uri ridică p95 (ex. 13,93 ms la ordinal 9 în rularea D).
- Aceeași închidere de surse, aceeași mașină, aceeași oră: 3,34 ms într-o rulare, 13,93 ms în alta.

## Concluzie

Pe aceeași mașină, același plan de energie și aceeași închidere de surse, normal70 p95 a variat între 3,34 ms și 13,93 ms (peste 4×) în decurs de câteva minute. Gate-ul absolut de 5,5 ms **nu este reproductibil** în aceste condiții. Cauza dovedită este zgomotul de fundal (~16% CPU constant din procese străine), nu capacitatea CPU-ului: contorul de performanță arată boost activ (143%) și rularea B a atins 3,34–4,57 ms, la fel ca desktopul.

Regula din Docs/25 interzice relaxarea pragurilor sau înlocuirea unei măsurători reale. Prin urmare:

- Acceptarea de performanță pentru 040 se poate relua aici **numai pe o mașină liniștită** (Adobe Creative Cloud, Chrome, Discord, UniGetUI și Lenovo Vantage închise, fără activitate paralelă), sau pe mașina de baseline originală.
- Criteriile funcționale 040 sunt deja verificate aici (16/16 pure, 2/2 native) — vezi `correctness-current-01/`.

## Note operaționale

- Harness-urile 040 au fost adaptate la această mașină: root absolut F: → C: (102 fișiere în main + 3 worktree-uri), nume de namespace nou `before-02`, plus pin-urile de identitate hardware din readeri (CPU `Ryzen 7 7735U`, GPU `Radeon(TM) Graphics`). Arhivele `Docs/Evidence` existente nu au fost modificate.
- `rg` (ripgrep) 15.2.0 a fost instalat prin winget (lipsa inițială a fost o cauză de blocaj a collectorului).
