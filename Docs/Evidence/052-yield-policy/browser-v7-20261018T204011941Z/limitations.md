# Limitări 052 — smoke pe revizia publicată (WEBGL2)

Acest fișier este obligatoriu pentru verificatorul derivat `verify-v7-targeted-smoke.mjs`, care refuză
statusul de trecere dacă lipsește sau dacă nu declară explicit limitările de mai jos.

## Stare

- **WEBGPU_UNMET** — proba browser pe backendul WebGPU (AUTO) nu a fost obținută pe această mașină și **nu este
  pretinsă**. Nu se declară acceptare de performanță sau hardware, FPS hardware, gate full sau soak.
- **DEFERRED_TO 220** și **DEFERRED_TO 224** — comparația hardware full pe ambele backenduri (5 perechi ×
  30 s warm + 120 s măsurare) se deferă gate-urilor 220/224.
- **APPROVED 2026-10-19** — amendament aprobat explicit de utilizator: închiderea PBI 052 la nivel `targeted`
  pe dovada nativă plus smoke-ul WEBGL2 de mai jos, cu limitarea WebGPU declarată aici. Cerința
  dual-backend din `Docs/yield-policy.md` rămâne în vigoare pentru gate-ul full; ea nu este ștearsă, doar
  deferată explicit.

## Eșecuri WebGPU păstrate (nu ascunse, nu reinterpretate)

| Sesiune | Browser | Ce s-a întâmplat |
| --- | --- | --- |
| `browser-v7-20261018T192001395Z` | Chrome 155 | braț 10 respins de `052 native phase simulation/wall ratio` (0.976181 / 0.976805) |
| `browser-v7-20261018T193106239Z` | Chrome 155 | braț 11 oprit de `Simulation overload debt after RAF before render` (rafDebt 524.6 ms) |
| `browser-v7-20261018T203144981Z` | Chrome 155 | export respins `HTTP413 > 4 MiB` (cauză de fixtură, reparată în commit `4aee1dd0`); toate 14 brațele înregistrate |
| `browser-v7-20261018T212619137Z` | Edge 155.0.4283.62 | braț 12: ratio 0.948586 / 0.946138, rafDebt 180.6 ms — reproducere independentă |

Toate capturile conțin `failure.json`/`rejected.json` păstrate, plus brațele și canalele brute.

## Atribuirea stall-ului (de ce nu e considerat un defect 052)

- `raf-scheduling-20261018-analysis` — faza `RAF_ONLY` (fără canvas GPU) e curată pe ambele backenduri
  (max ~19 ms); faza `EMPTY_RENDERER` cu **scenă goală** are un stall de 214 ms **doar pe WebGPU**, cu zero
  longtask; WEBGL2 curat în toate fazele.
- `v7-smoke-sessions-20261018/stall-attribution` — la brațul căzut, timpul se duce în livrarea frame-ului
  (`stamp` cu ~530 ms după `beforeNative`), în timp ce callback-ul are 2.5 ms, costurile native 1.6–2.4 ms și
  `nativeSerial` nu avansează; fără TDR/Display, fără Application Hang, fără evenimente de power.
- Reproducerea în Edge (build Chromium independent) elimină ipoteza „regresie Chrome 155/Dawn“.

## Ce susține închiderea targeted

- Proba **nativă** AFTER (`after-main029.json`): paritate exactă cu BEFORE, 34 lumi, 10 perechi fără regresie.
- Brațele de **calibrare WEBGL2** din sesiunea verificată: fizică Rapier reală în browser, aceleași lumi,
  doar pragul diferă (0.2 s acceptă la tick 1 și contactează cu 8964.39 / 5424.85 N·s; 3 s refuză până la
  tick 30, fără contact).

## Valori indisponibile

GPU exact, heap exact și WASM exact rămân `null`; nu sunt estimate sau deduse.
