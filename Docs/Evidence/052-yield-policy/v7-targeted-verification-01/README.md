# Verificarea targeted 052 — notă procedurală

Comanda rulată (din worktree, cwd = rădăcina checkout-ului):

```powershell
node --import ./scripts/register-typescript.mjs \
  Docs/Evidence/052-yield-policy/verify-v7-targeted-smoke.mjs \
  Docs/Evidence/052-yield-policy/browser-v7-20261018T204011941Z
```

Rezultat: `exit=0`, `stdout.json` =
`{"verified":true,"status":"TARGETED_SMOKE_PASS_NO_HARDWARE_ACCEPTANCE","performanceAcceptance":false,"hardwareFullAcceptance":false, ...}`
(`stderr.txt` conține doar `ExperimentalWarning: stripTypeScriptTypes`).

## Restaurarea directorului de build „live"

Verificatorul V7 (și derivata lui) compară artefactele arhivate cu directorul de build **live**
`.pbi-validation-052-v7/build`. Acel director a fost șters intenționat în timpul experimentelor de adaptor și
Edge, când fiecare sesiune nouă de fixtură cere un director de build absent.

Înainte de verificare, directorul a fost **reconstruit byte-cu-byte din `artifacts/` al sesiunii**
(`Docs/Evidence/052-yield-policy/browser-v7-20261018T204011941Z/artifacts`, 184 fișiere). Nu este o dovadă
nouă: verificatorul însuși re-calculează `bytes.length` și `sha256` pentru fiecare artefact arhivat și le
compară cu copia live, deci consangvinitatea arhivei este verificată independent de restaurare. Restaurarea
reface doar un director scratch șters, nu modifică arhiva, ZIP-ul sau capturile.

## Ce verifică derivata (peste verificatorul înghețat)

- toate aserțiunile de integritate: sursă curentă vs arhivă, artefacte, native, ZIP vs intrări, identitate AMD,
  inventar, 14 brațe, părți/canale, digesturi, paritate pereche, cleanup;
- aserțiunile de criteriu, independente de backend: `risky.firstEntryTick < prudent.firstEntryTick`,
  `risky.collisionTick !== null && risky.maxImpulseNs > 0`, `prudent.collisionTick === null`, plus
  `CROSSED_WITH_PRIORITY_EXPOSURE` cu `learningEligible: null`;
- obligatoriu `limitations.md` în folderul verificat, cu tokenii `WEBGPU_UNMET`, `DEFERRED_TO 220`,
  `DEFERRED_TO 224`, `APPROVED 2026-10-19` și referințele la cele patru sesiuni WebGPU eșuate și la cele două
  documente de atribuire.

Statusul emis este `TARGETED_SMOKE_PASS_NO_HARDWARE_ACCEPTANCE`; derivata nu poate emite un PASS generic.
