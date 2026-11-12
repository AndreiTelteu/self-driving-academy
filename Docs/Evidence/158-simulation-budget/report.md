# PBI 158 — buget de simulare și estimare

- Contract: `158-simulation-budget-v1`, fixture `158-simulation-v1`, bugete `203-initial-1`
- Baseline: commit `546fa29e5ac6b4ed770c7acf6181d191956e1537-dirty`, capturat `2026-11-12T06:13:11.707Z`
- După optimizare: commit `546fa29e5ac6b4ed770c7acf6181d191956e1537-dirty`, capturat `2026-11-12T06:13:41.024Z`
- Hardware: AMD Ryzen 7 7735U with Radeon Graphics, 16 fire logice, win32 10.0.26300
- Protocol: 3 treceri × 3 repetări × (120 warmup + 360 tick-uri măsurate, publicare la 6 tick-uri, 6 sloturi de decizie); 3 × (20 + 200) estimări; 1000 × 3 mesaje; valoarea raportată este mediana

## Echivalență semantică (SHA-256 peste toate ieșirile)

| Componentă | Înainte | După | Intrări | Status |
| --- | --- | --- | ---: | --- |
| decisions | `de26979479d1423d1e769016ebdf8c22c1e317f3759a9c8f7a905375e15cf07b` | `de26979479d1423d1e769016ebdf8c22c1e317f3759a9c8f7a905375e15cf07b` | 26400 | IDENTICAL |
| estimation | `05d0a9d1af8c5b5ea4975584db9fc4d1d846a56946e98cf575a187223a5c1173` | `05d0a9d1af8c5b5ea4975584db9fc4d1d846a56946e98cf575a187223a5c1173` | 1320 | IDENTICAL |
| transfer | `ed6c2c141ddc76df9c9647617258432d7d0ba60f77edb9c8847cc0ae2dad8370` | `ed6c2c141ddc76df9c9647617258432d7d0ba60f77edb9c8847cc0ae2dad8370` | 6000 | IDENTICAL |

## Metrici

| ID | Metrică | Înainte | După | Buget | Verdict | Notă |
| --- | --- | ---: | ---: | --- | --- | --- |
| decisions.tickP95Ms | Tick de decizii (publicare 044 când e rândul + slotul 219) p95 | 6.9296 | 6.3242 | 8 (maximum) | PASS | Costul componentei de decizii pe cadentța reală (fazare pe 6 tick-uri, publicare la 10 Hz), nu tick-ul autoritar complet; bugetul de tick acoperă întregul tick, deci limita este superioară. |
| decisions.publicationP95Ms | Publicare context 044 (admitere cadru + index) p95 | 6.3779 | 4.8106 | — | REPORTED | înainte 6.3779 → după 4.8106 (-24.6%) |
| decisions.slotDeriveP95Ms | Derivare contexte pentru slotul de decizie (≈18 vehicule) p95 | 3.0996 | 3.3785 | — | REPORTED | înainte 3.0996 → după 3.3785 (9%) |
| estimation.mainThreadSubmitP95Ms | Estimare: cost sincron pe firul principal per cerere p95 | 0.0171 | 0.0145 | 20 (maximum) | PASS | Criteriul „estimarea nu blochează inputul”: costul sincron de admitere, comparat cu bugetul de main-thread. |
| estimation.workerStepP95Ms | Estimare: felie worker (decode + blend 101 + encode) p95 | 0.0534 | 0.046 | 10 (maximum) | PASS | înainte 0.0534 → după 0.046 (-13.9%) |
| estimation.largeSubmitP95Ms | Estimare: admitere sincronă pentru 4096 episoade p95 | 1.6334 | 2.1253 | 10 (maximum) | PASS | Plafonul de admitere (4096 episoade) trebuie să rămână sub felia de 10 ms. |
| transfer.payloadCopiesPerEstimate | Copii de payload per estimare (slice de ArrayBuffer) | 2 | 0 | 2 (maximum) | PASS | Aceleași date livrate (digest identic), dar fără copierea suplimentară a bufferului de cerere/rezultat. |
| transfer.payloadCopiedBytesPerEstimate | Bytes copiați per estimare | 2199.627 | 0 | 2199.627 (maximum) | PASS | înainte 2199.627 → după 0 (-100%) |
| transfer.requestBytes | Payload de cerere per estimare | 1971 | 1971 | 16777216 (maximum) | PASS | înainte 1971 → după 1971 (0%) |
| transfer.deliveredPayloadBytes | Bytes de date livrate în proba de transfer | 2304000 | 2304000 | 16777216 (maximum) | PASS | Trebuie să rămână identic: optimizarea reduce copiile, nu datele. |
| transfer.perMessageP95Ms | Cost per mesaj worker (send + receive + control) p95 | 0.0234 | 0.0176 | — | REPORTED | înainte 0.0234 → după 0.0176 (-24.8%) |
| transfer.controlBufferAllocations | Alocări de buffer per pachet de control | 1 | 0 | 0 (maximum) | PASS | înainte 1 → după 0 (-100%) |

## Verdicte

- decizii: **PASS**
- estimare: **PASS**
- transferuri: **PASS**
- echivalență: **PASS**
- general: **PASS**

## Limitări

- Proba este headless (Node): nu măsoară randare, frame, GPU sau pacing real.
- Costurile sunt per componentă pe fixture-ul de 110 vehicule/96 obstacole/256 zone, nu tick-ul complet al jocului.
- Baseline-ul este o măsurătoare reală dinaintea optimizării; nu se reexecută pe codul optimizat și nu se reclasifică.
- Timpii de perete sunt re-măsurați la fiecare rulare; digests și bytes sunt deterministe.
- Fiecare metrică este mediana a 3 treceri independente × repetările din trecere, ca în protocolul 155/156/220; o singură rulare încărcată nu mută verdictul.
- Coloana `laptop` a manifestului este aplicată; coloana `desktop` nu se împrumută.
- Pragul relativ de regresie (10% și 1 ms) este cel din manifest.
