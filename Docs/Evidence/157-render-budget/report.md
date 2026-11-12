# PBI 157 — raport determinist al bugetului de randare

Probe structurale în NullEngine pe contractele reale de prezentare (`157-render-budget-v1`). Bugetele sunt citate din manifestul `203-initial-1` și **nu** sunt modificate.

- Înainte: `baseline înainte de optimizare (sursa neatinsă)` · commit `546fa29e5ac6` · 2026-11-12T06:06:49.434Z
- După: `după optimizare (aceeași probă, același fixture)` · commit `546fa29e5ac6` · 2026-11-12T06:04:42.327Z
- Sumar: **17 PASS**, **0 FAIL**, 2 NOT_MEASURED; gate structural `STRUCTURAL_PASS`, gate hardware `NOT_VALIDATED`

## Metrici structurale

| Metrică | Unitate | Înainte | După | Buget | Verdict | Notă |
| --- | --- | ---: | ---: | --- | --- | --- |
| draw calls ale layout-ului orașului (042) | draw calls | 155 | 12 | 128 (≤) | PASS | 923 elemente în 12 mesh-uri (4 hosturi thin cu 78 instanțe) |
| instanțe thin în batchurile orașului | instances | 0 | 78 | 8192 (≤) | PASS | semnalele repetate sunt instanțiate pe geometrie unitară partajată |
| obiecte Babylon deținute de scena orașului | objects | 155 | 12 | — | REPORTED | mesh-uri, nu instanțe: o instanță nu creează un obiect Babylon |
| batchuri statice pe material (oraș + decor) | batches | 36 | 40 | 512 (≤) | PASS | celule de decor 146 plus hosturile thin ale orașului; un host înlocuiește zeci de mesh-uri per element |
| draw calls ale decorului 146 (control neschimbat) | draw calls | 36 | 36 | 128 (≤) | PASS | 1585 itemuri în 36 celule |
| draw calls totale ale scenei de referință (oraș + decor) | draw calls | 191 | 48 | 128 (≤) | PASS | suma celor două fixture-uri reale, aceeași scenă și același layout |
| abaterea maximă a limitelor unui element față de baseline | px | 0 | 0.000029 | 0.0001 (≤) | PASS | 923 elemente comparate față de 122; elemente lipsă 0 |
| digest-uri de vârfuri de bandă identice | count | 96 | 96 | — | PASS | diferite: 0 |
| casters esențiali (taxiul selectat) în shadow map | count | 0 | 0 | 1 (≥) | PASS | preset LOW: harta de umbre e dezactivată prin contract, deci nimic nu intră |
| casters admiși în shadow map | count | 0 | 0 | 0 (≤) | PASS | înregistrați 71, respinși 71; harta 0² |
| casters esențiali (taxiul selectat) în shadow map | count | 0 | 1 | 1 (≥) | PASS | plafon 48, admitere pe prioritate (esențial → standard → opțional) |
| casters admiși în shadow map | count | 48 | 48 | 48 (≤) | PASS | înregistrați 71, respinși 23; harta 1024² |
| casters esențiali (taxiul selectat) în shadow map | count | 1 | 1 | 1 (≥) | PASS | plafon 96, admitere pe prioritate (esențial → standard → opțional) |
| casters admiși în shadow map | count | 71 | 71 | 96 (≤) | PASS | înregistrați 71, respinși 0; harta 2048² |
| tranziții LOD pe balaria de distanță (0 … 4×prag) | count | 1 | 1 | 1 (≤) | PASS | nivele: NEAR → NEAR → NEAR → NEAR → NEAR → FAR → FAR; oscilații în banda de histerezis: 0 |
| tranziții LOD pe balaria de distanță (0 … 4×prag) | count | 1 | 1 | 1 (≤) | PASS | nivele: NEAR → NEAR → NEAR → NEAR → NEAR → FAR → FAR; oscilații în banda de histerezis: 0 |
| tranziții LOD pe balaria de distanță (0 … 4×prag) | count | 1 | 1 | 1 (≤) | PASS | nivele: NEAR → NEAR → NEAR → NEAR → NEAR → FAR → FAR; oscilații în banda de histerezis: 0 |
| raze cu aceeași identitate înainte/după instanțiere | count | 32 | 32 | 32 (≥) | PASS | 7 raze au nimerit un vehicul; toate cele 32 au aceeași identitate |
| interval de cadru p95 (hardware) | ms | — | — | 35 (≤) | NOT_MEASURED | proba este structurală, în NullEngine: nu există renderer hardware, deci frame time-ul nu este măsurat și nu se raportează 0 |
| lucru GPU p95 | ms | — | — | 28 (≤) | NOT_MEASURED | fără context GPU nu există timer; valoarea rămâne null (Docs/25: headless/software nu dovedește FPS) |

## Invarianți verificati

- 923 elemente randate înainte și 923 după; identitatea fiecărui element este păstrată
- instanțe thin: 0 → 78; mesh-uri: 155 → 12
- materiale înghețate: 0 → 12
- vârfuri/triunghiuri: 19172/10054 → 18580/9314
- picking: 32/32 raze identice (7 nimeresc un vehicul)
- LOD: LOW 1 tranziție/0 oscilații; MEDIUM 1 tranziție/0 oscilații; HIGH 1 tranziție/0 oscilații
- umbre: LOW 0/0 admiși, esențial 0; MEDIUM 48/48 admiși, esențial 1; HIGH 71/96 admiși, esențial 1
- manifest: Docs/performance-budgets.json (203-initial-1); bugetele nu au fost modificate

## Abateri

Niciun rând nu depășește bugetul citat.

## Ce nu a putut fi măsurat

- **interval de cadru p95 (hardware)**: proba este structurală, în NullEngine: nu există renderer hardware, deci frame time-ul nu este măsurat și nu se raportează 0
- **lucru GPU p95**: fără context GPU nu există timer; valoarea rămâne null (Docs/25: headless/software nu dovedește FPS)

Verdictul acoperă numai partea structurală măsurabilă determinist; gate-ul hardware al jocului complet rămâne NOT_VALIDATED.
