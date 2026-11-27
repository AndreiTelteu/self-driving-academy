# 271 — transcriptul determinist al celor trei moduri live

Generat de `npm run modes:live`.

| Clasă | Tranziție | Tick | Închis | Motiv | Deschis | Eligibil | Scaune | Δv (m/s) | pas (m) |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |
| TAXI | AUTO->MANUAL (M) | 21 | — | — | MANUAL | false | 1 | 0.000000 | 0.000000 |
| TAXI | MANUAL->AUTO (M) | 42 | MANUAL | RETURN_TO_AUTO | — | — | 0 | 0.000000 | 0.025794 |
| TAXI | AUTO->LEARNING (L) | 43 | — | — | LEARNING | true | 1 | 0.000000 | 0.025794 |
| TAXI | LEARNING->MANUAL (L) | 44 | LEARNING | MODE_CHANGE | MANUAL | false | 1 | 0.000000 | 0.025794 |
| TAXI | MANUAL->LEARNING (L) | 45 | MANUAL | MODE_CHANGE | LEARNING | true | 1 | 0.000000 | 0.025794 |
| TAXI | LEARNING->AUTO (M) | 46 | LEARNING | RETURN_TO_AUTO | — | — | 0 | 0.000000 | 0.025794 |
| CIVIL | AUTO->MANUAL (M) | 6 | — | — | MANUAL | false | 1 | 0.000000 | 0.000139 |
| CIVIL | MANUAL->AUTO (M) | 27 | MANUAL | RETURN_TO_AUTO | — | — | 0 | 0.000000 | 0.035492 |
| CIVIL | AUTO->LEARNING (L) | 28 | — | — | LEARNING | true | 1 | 0.000000 | 0.035492 |
| CIVIL | LEARNING->MANUAL (L) | 29 | LEARNING | MODE_CHANGE | MANUAL | false | 1 | 0.000000 | 0.035492 |
| CIVIL | MANUAL->LEARNING (L) | 30 | MANUAL | MODE_CHANGE | LEARNING | true | 1 | 0.000000 | 0.035492 |
| CIVIL | LEARNING->AUTO (M) | 31 | LEARNING | RETURN_TO_AUTO | — | — | 0 | 0.000000 | 0.035492 |

- Tranziții: 12
- Segmente LEARNING expuse pentru 272: 4
- Publicări de profil: 0
- HUD LEARNING: „Conduci · orașul învață” (L)
- Eșecuri: niciunul
- Limitare: AUTO revine din poziția/viteza fizică curentă; reproiectarea pe graful de benzi începe în tickul următor, iar reintrarea completă rămâne 054/282.
