# 268 — costul de simulare al companiei

Generat de `npm run company:finance:cost`. Nu este un certificat FPS/GPU/hardware.

| Metric | Value |
| --- | ---: |
| Samples | 2700 |
| Mean | 0.009193 ms |
| p50 | 0.0078 ms |
| p95 | 0.0157 ms |
| Max | 0.0813 ms |
| Tick budget | 8 ms |
| Budget share (p95) | 0.196% |
| Pass | PASS |

Baseline de referință: PBI 155 laptop tick p95 0.081 ms/tick (driving baseline, no renderer); the company cost is reported separately and never subtracted from that baseline.

Headless Node subsystem step on the real 265/266 fixture; no renderer, GPU, browser frame or hardware claim.
