# PBI052 — Edge ca diagnostic: același stall WebGPU (2026-10-19)

Scop: discriminatorul rămas după testul de adaptor — este stall-ul WebGPU o regresie de **build Chromium**
(Chrome 155) sau stă în **calea D3D12/WebGPU pe acest driver AMD**? Am repetat smoke-ul WebGPU într-un build
Chromium independent, **Edge 155.0.4283.62**, cu același stack Dawn/D3D12 și același driver AMD.

Folosit **doar ca diagnostic**, nu ca probă de acceptare (identitate de mediu diferită, UA `Edg/…`).

## Metodă

Aceeași fixtură V7 (`source af3fbf38…`, `artifact ca729dca…`), același driver CDP, profil temporar Edge curat
cu `--disable-extensions --disable-sync --disable-component-update` (prima pornire importase automat extensii
în profilul temporar; profilul a fost șters). Sonde înainte de probă: adaptor `amd` / `rdna-2`,
`Dawn Info: <Integrated GPU> D3D12 backend - AMD Radeon(TM) Graphics` — identic cu Chrome.

## Rezultat: același eșec

`browser-v7-20261018T212619137Z`, captură `WEBGPU-smoke` → **FAIL** la brațul 12 (pair 4):

| | Edge (arm 12) | Chrome (arm 10, sesiunea 192001) | Chrome (arm 11, sesiunea 193106) |
| --- | --- | --- | --- |
| eroare | `052 native phase simulation/wall ratio` | același ratio | `Simulation overload debt after RAF before render` |
| nativePhaseRatio / matchedRafRatio | **0.948586 / 0.946138** | 0.976181 / 0.976805 | — |
| `beforeNative.debtMs` / `rafDebt` | **171.2 / 180.6 ms** | rafDebt 85.9 ms | **524.6 ms** |
| muncă în callback (stamp→callback) | 1.3 ms | 2.5 ms | 2.5 ms |
| costuri native per tick | 1.7–2.3 ms | 1.6–2.4 ms | 1.6–2.4 ms |
| `warmBoundary` | WITHIN_EXISTING_BOUNDARY | WITHIN_EXISTING_BOUNDARY | WITHIN_EXISTING_BOUNDARY |

12 brațe trimise, captura respinsă cu `rejected.json` + `failure.json` păstrate. Semnătura e identică:
**timpul se duce în livrarea/prezentarea frame-ului** (aici `previousRaf.observedAtMs` e cu 172 ms după
propria stampilă), în timp ce munca aplicației și pașii nativi rămân normale.

## Interpretare

Reproducerea într-un **build Chromium independent** (Edge) elimină ipoteza „regresie Chrome 155/Dawn“:
problema stă în calea **D3D12/WebGPU pe iGPU-ul AMD Radeon 680M** (driver / planificare GPU), nu în build-ul
browserului și nu în codul 052. Se aliniază cu diagnosticul RAF_ONLY anterior (RAF_ONLY curat; scenă goală pe
WebGPU → stall 214 ms; WEBGL2 curat în toate fazele).

## Limite

- Stall intermitent: o singură încercare Edge; faptul că se reproduce nu dovedește frecvența.
- Edge nu e mediul de acceptare consemnat în `Docs/yield-policy.md`; rezultatul e diagnostic.
- Nu separă driver-ul de planificarea GPU a Windows (HAGS) sau de alte cauze de sistem.

## Următori pași

1. **HAGS on/off** (Setări Windows → planificare GPU accelerată) — necesită acțiunea utilizatorului + reboot.
2. **Driver AMD** actualizat pentru 680M.
3. Altă mașină/CI cu GPU (răspuns definitiv, mediu nou).

Artefacte: sesiunea de mai sus (brațe, canale, `failure.json`, `rejected.json`, ZIP) și logurile serverului în
`v7-edge-probe-01/`.
