# Regresie controlată — gate-ul 224

Demonstrația rulează `scripts/ci/run-regression-demo.mjs` pe aceeași revizie, de trei ori, și păstrează
integral artefactele fiecărei rulări. Regresia este un modul generat de 3 300 000 B, adăugat în entry-ul
buildului de producție din `.pbi-validation-224/` (director ignorat de git și șters de gate după rulare);
`src/` nu este modificat, iar în commit nu rămâne niciun byte al regresiei.

| Rulare | Build | Structural | Release | Bundle | Bytes JS+WASM | Motiv |
| --- | --- | --- | --- | --- | ---: | --- |
| `01-baseline` | curat | `PASS` | `NOT_VALIDATED` | `PASS` | 6 125 279 | FPS fără GPU real rămâne deschis |
| `02-regression` | +3 300 000 B | `FAIL` | `FAIL` | `FAIL` | 9 425 362 | „bundle-ul depășește capacitatea de 8,00 MiB cu 0,99 MiB” |
| `03-restored` | curat | `PASS` | `NOT_VALIDATED` | `PASS` | 6 125 279 | aceiași bytes și digests ca `01-baseline` |

Fiecare rulare are `measurement.json`, `report.json` și `report.md` în directorul ei; sumarul automat este
în [summary.json](summary.json) (`detected: true`, `recovered: true`). Comanda de reproducere:

```
node --import ./scripts/register-typescript.mjs scripts/ci/run-regression-demo.mjs
```

Rularea de regresie iese cu cod 1 (gate-ul pică), iar scriptul demonstrației îl tratează ca rezultat
așteptat; succesul demonstrației înseamnă detecție **și** revenire, nu absența eșecului.
