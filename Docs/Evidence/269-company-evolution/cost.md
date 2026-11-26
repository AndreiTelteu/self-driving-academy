# 269 — costul de simulare al evoluției companiei

Generat de `npm run company:evolution:cost`. Nu este un certificat FPS/GPU/hardware.

| Metric | Read model | Ride with active modifier |
| --- | ---: | ---: |
| Samples | 3000 | 900 |
| Mean | 0.013062 ms | 0.010574 ms |
| p50 | 0.0108 ms | 0.0075 ms |
| p95 | 0.0192 ms | 0.019 ms |
| Max | 0.8238 ms | 0.3708 ms |

Buget de tick: 8 ms; share (p95 maxim) 0.240%; PASS.

Baseline de referință: PBI 268 company step p95 0.0157 ms/tick on the real fixture; this report adds the 269 read and modified-ride costs separately and never subtracts them from that baseline.

Headless Node subsystem measurement on a deterministic ledger and real 057 registry; no renderer, GPU, browser frame or hardware claim.
