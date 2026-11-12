# PBI 155 — verificarea hardware și a bugetelor fixate

Raport determinist derivat din măsurătorile comise (155-hardware-budget-v1); bugetele sunt citate din manifestul `203-initial-1` și **nu** sunt modificate.

- Build curent: `f5fb79fd07c7e92c2c7b541b109bfa83367cc1d6`
- Sumar: **85 PASS**, **0 FAIL**, 6 NOT_MEASURED, 17 STRUCTURAL, 1 REPORTED
- Verdict: `MEASURED_CONFIGURATIONS_PASS`; gate hardware al jocului complet: `NOT_VALIDATED`

Coloanele min/p50/p95/p99/max ale fiecărui rând sunt statistica valorii metricii pe cele cinci repetări; distribuția per cadru (p50/p95/p99, histogramă, cadre peste buget) a fiecărei rulări este în `report.json`.

## Configurațiile măsurate

| Configurație | Workload | Backend | Coloană | Preset | CSS | Intern | DPR | Repetări | Build | Protocol |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| laptop-webgpu-scaling-20 | 20 taxiuri / 20 civili | WEBGPU | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact d6762c65ed48 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgpu-normal-24 | 24 taxiuri / 40 civili | WEBGPU | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact d6762c65ed48 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgpu-maximum-30 | maxim V1: 30 taxiuri / 40 civili | WEBGPU | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact d6762c65ed48 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgpu-overload-30-80 | suprasarcină: 30 taxiuri / 80 civili | WEBGPU | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact d6762c65ed48 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgl2-scaling-20 | 20 taxiuri / 20 civili | WEBGL2 | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact 15324dcdb698 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgl2-normal-24 | 24 taxiuri / 40 civili | WEBGL2 | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact 15324dcdb698 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgl2-maximum-30 | maxim V1: 30 taxiuri / 40 civili | WEBGL2 | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact 15324dcdb698 | 5 × (30 s warmup + 120 s măsurare) |
| laptop-webgl2-overload-30-80 | suprasarcină: 30 taxiuri / 80 civili | WEBGL2 | laptop | LOW_FIXED_220_FLEET | 1920×1080 | 1920×1080 | 1 | 5 | 2d68b43c8cdf · artifact 15324dcdb698 | 5 × (30 s warmup + 120 s măsurare) |

## Cadru, main thread și cadență

| Metrică | Configurație | min | p50 | p95 | p99 | max | Buget | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| interval de cadru p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 16.8 | 16.8 | 16.9 | 16.9 | 16.9 | 35 ms (≤) | PASS |
| interval de cadru p99 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 16.9 | 16.9 | 17 | 17 | 17 | 50 ms (≤) | PASS |
| lucru pe firul principal p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 3.4 | 3.6 | 3.7 | 3.7 | 3.7 | 20 ms (≤) | PASS |
| tick autoritar p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 3 | 3.2 | 3.2 | 3.2 | 3.2 | 8 ms (≤) | PASS |
| pas Rapier p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 0.3 | 0.3 | 0.5 | 0.5 | 0.5 | 5 ms (≤) | PASS |
| cadență derivată din intervalul p50 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | PASS |
| lucru GPU p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | — | — | — | — | — | 28 ms (≤) | NOT_MEASURED |
| Long Task maxim de aplicație | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 16.8 | 16.8 | 16.8 | 16.8 | 16.8 | 35 ms (≤) | PASS |
| interval de cadru p99 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 16.9 | 16.9 | 16.9 | 16.9 | 16.9 | 50 ms (≤) | PASS |
| lucru pe firul principal p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 4.8 | 5.2 | 5.4 | 5.4 | 5.4 | 20 ms (≤) | PASS |
| tick autoritar p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 4.3 | 4.7 | 4.9 | 4.9 | 4.9 | 8 ms (≤) | PASS |
| pas Rapier p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 0.3 | 0.4 | 0.4 | 0.4 | 0.4 | 5 ms (≤) | PASS |
| cadență derivată din intervalul p50 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | PASS |
| lucru GPU p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | — | — | — | — | — | 28 ms (≤) | NOT_MEASURED |
| Long Task maxim de aplicație | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 16.8 | 16.8 | 16.9 | 16.9 | 16.9 | 35 ms (≤) | PASS |
| interval de cadru p99 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 16.9 | 16.9 | 17 | 17 | 17 | 50 ms (≤) | PASS |
| lucru pe firul principal p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 5.3 | 6.1 | 6.5 | 6.5 | 6.5 | 20 ms (≤) | PASS |
| tick autoritar p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 4.8 | 5.5 | 5.8 | 5.8 | 5.8 | 8 ms (≤) | PASS |
| pas Rapier p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 0.4 | 0.4 | 0.4 | 0.4 | 0.4 | 5 ms (≤) | PASS |
| cadență derivată din intervalul p50 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | PASS |
| lucru GPU p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | — | — | — | — | — | 28 ms (≤) | NOT_MEASURED |
| Long Task maxim de aplicație | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 16.8 | 16.8 | 16.8 | 16.8 | 16.8 | 35 ms (≤) | STRUCTURAL |
| interval de cadru p99 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 16.8 | 16.9 | 16.9 | 16.9 | 16.9 | 50 ms (≤) | STRUCTURAL |
| lucru pe firul principal p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 7.1 | 7.6 | 7.8 | 7.8 | 7.8 | 20 ms (≤) | STRUCTURAL |
| tick autoritar p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 6.4 | 6.9 | 7 | 7 | 7 | 8 ms (≤) | STRUCTURAL |
| pas Rapier p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 | 5 ms (≤) | STRUCTURAL |
| cadență derivată din intervalul p50 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | STRUCTURAL |
| lucru GPU p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | — | — | — | — | — | 28 ms (≤) | NOT_MEASURED |
| Long Task maxim de aplicație | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 16.8 | 16.8 | 16.8 | 16.8 | 16.8 | 35 ms (≤) | PASS |
| interval de cadru p99 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 16.9 | 16.9 | 16.9 | 16.9 | 16.9 | 50 ms (≤) | PASS |
| lucru pe firul principal p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 3.2 | 3.3 | 3.5 | 3.5 | 3.5 | 20 ms (≤) | PASS |
| tick autoritar p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 3 | 3.1 | 3.2 | 3.2 | 3.2 | 8 ms (≤) | PASS |
| pas Rapier p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 0.3 | 0.3 | 0.4 | 0.4 | 0.4 | 5 ms (≤) | PASS |
| cadență derivată din intervalul p50 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | PASS |
| lucru GPU p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 0.493 | 1.087 | 1.176 | 1.176 | 1.176 | 28 ms (≤) | PASS |
| Long Task maxim de aplicație | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 16.8 | 16.8 | 16.9 | 16.9 | 16.9 | 35 ms (≤) | PASS |
| interval de cadru p99 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 16.9 | 16.9 | 17 | 17 | 17 | 50 ms (≤) | PASS |
| lucru pe firul principal p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 4.4 | 4.5 | 4.8 | 4.8 | 4.8 | 20 ms (≤) | PASS |
| tick autoritar p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 4.1 | 4.2 | 4.4 | 4.4 | 4.4 | 8 ms (≤) | PASS |
| pas Rapier p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 0.3 | 0.3 | 0.4 | 0.4 | 0.4 | 5 ms (≤) | PASS |
| cadență derivată din intervalul p50 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | PASS |
| lucru GPU p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 0.493 | 1.074 | 1.091 | 1.091 | 1.091 | 28 ms (≤) | PASS |
| Long Task maxim de aplicație | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 16.8 | 16.8 | 16.9 | 16.9 | 16.9 | 35 ms (≤) | PASS |
| interval de cadru p99 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 16.9 | 16.9 | 16.9 | 16.9 | 16.9 | 50 ms (≤) | PASS |
| lucru pe firul principal p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 4.8 | 4.9 | 5.1 | 5.1 | 5.1 | 20 ms (≤) | PASS |
| tick autoritar p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 4.4 | 4.5 | 4.7 | 4.7 | 4.7 | 8 ms (≤) | PASS |
| pas Rapier p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 0.3 | 0.4 | 0.4 | 0.4 | 0.4 | 5 ms (≤) | PASS |
| cadență derivată din intervalul p50 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | PASS |
| lucru GPU p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 0.493 | 1.09 | 1.109 | 1.109 | 1.109 | 28 ms (≤) | PASS |
| Long Task maxim de aplicație | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |
| interval de cadru p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 16.8 | 16.8 | 16.9 | 16.9 | 16.9 | 35 ms (≤) | STRUCTURAL |
| interval de cadru p99 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 16.9 | 16.9 | 17 | 17 | 17 | 50 ms (≤) | STRUCTURAL |
| lucru pe firul principal p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 5.7 | 5.8 | 6.5 | 6.5 | 6.5 | 20 ms (≤) | STRUCTURAL |
| tick autoritar p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 5.2 | 5.3 | 6 | 6 | 6 | 8 ms (≤) | STRUCTURAL |
| pas Rapier p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 0.4 | 0.4 | 0.5 | 0.5 | 0.5 | 5 ms (≤) | STRUCTURAL |
| cadență derivată din intervalul p50 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 59.88 | 59.88 | 59.88 | 59.88 | 59.88 | 30 fps (≥) | STRUCTURAL |
| lucru GPU p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 0.493 | 1.09 | 1.18 | 1.18 | 1.18 | 28 ms (≤) | STRUCTURAL |
| Long Task maxim de aplicație | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 0 | 0 | 0 | 0 | 0 | 50 ms (≤) | PASS |

## Simulare, tick și learning

| Metrică | Configurație | min | p50 | p95 | p99 | max | Buget | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| închidere segment → activare learning p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 17.2 | 17.4 | 17.8 | 17.8 | 17.8 | 2000 ms (≤) | PASS |
| timp simulat / timp real activ | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 17.7 | 17.8 | 18.1 | 18.1 | 18.1 | 2000 ms (≤) | PASS |
| timp simulat / timp real activ | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 17.6 | 17.8 | 19.1 | 19.1 | 19.1 | 2000 ms (≤) | PASS |
| timp simulat / timp real activ | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 17.8 | 18.5 | 19 | 19 | 19 | 2000 ms (≤) | STRUCTURAL |
| timp simulat / timp real activ | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 17 | 17.3 | 17.5 | 17.5 | 17.5 | 2000 ms (≤) | PASS |
| timp simulat / timp real activ | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 17.4 | 17.7 | 17.8 | 17.8 | 17.8 | 2000 ms (≤) | PASS |
| timp simulat / timp real activ | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 17.3 | 17.6 | 18.2 | 18.2 | 18.2 | 2000 ms (≤) | PASS |
| timp simulat / timp real activ | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | — | — | — | — | — | fără buget | PASS |
| închidere segment → activare learning p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 17.9 | 17.9 | 18.7 | 18.7 | 18.7 | 2000 ms (≤) | STRUCTURAL |
| timp simulat / timp real activ | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 1.0001 | 0.98 ratio (≥) | PASS |
| vehicule fizice păstrate | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | — | — | — | — | — | fără buget | PASS |
| cleanup fără resurse deținute | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | — | — | — | — | — | fără buget | PASS |

## Input

| Metrică | Configurație | min | p50 | p95 | p99 | max | Buget | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| input → aplicarea comenzii p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 1.6 | 1.6 | 1.8 | 1.8 | 1.8 | 80 ms (≤) | PASS |
| input → aplicarea comenzii p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 2.1 | 2.2 | 2.4 | 2.4 | 2.4 | 80 ms (≤) | PASS |
| input → aplicarea comenzii p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 2.4 | 2.5 | 2.6 | 2.6 | 2.6 | 80 ms (≤) | PASS |
| input → aplicarea comenzii p95 | laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 3.5 | 3.7 | 3.8 | 3.8 | 3.8 | 80 ms (≤) | STRUCTURAL |
| input → aplicarea comenzii p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20 | 1.5 | 1.6 | 1.7 | 1.7 | 1.7 | 80 ms (≤) | PASS |
| input → aplicarea comenzii p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24 | 2 | 2 | 2.2 | 2.2 | 2.2 | 80 ms (≤) | PASS |
| input → aplicarea comenzii p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30 | 2.1 | 2.2 | 2.3 | 2.3 | 2.3 | 80 ms (≤) | PASS |
| input → aplicarea comenzii p95 | laptop · WEBGL2 · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80 | 2.9 | 3 | 3.3 | 3.3 | 3.3 | 80 ms (≤) | STRUCTURAL |

## Memorie

| Metrică | Configurație | min | p50 | p95 | p99 | max | Buget | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| heap JS al paginii (performance.memory) | laptop · WEBGPU · toate rulările comise | 36.996 | 52.51 | 69.011 | 69.65 | 69.65 | fără buget | REPORTED |
| vârf de bytes încărcați în recorder | recorder real peste 70 vehicule | 1.331 | 1.331 | 1.331 | 1.331 | 1.331 | 32 MiB (≤) | PASS |
| memoria exactă a paginii și a GPU | laptop | — | — | — | — | — | fără buget | NOT_MEASURED |

## Încărcare

| Metrică | Configurație | min | p50 | p95 | p99 | max | Buget | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| JS+WASM critice transferate (build de producție) | build f5fb79fd07c7 · 130 artefacte | 5.841 | 5.841 | 5.841 | 5.841 | 5.841 | 8 MiB (≤) | PASS |
| pornire la prima comandă acceptată, cold p95 | joc complet | — | — | — | — | — | 12000 ms (≤) | NOT_MEASURED |

## Costul fiecărui sistem peste baseline

| Sistem | Cadență | Invocări/eșantion | Δ ms/invocare p95 | Δ ms/tick p95 | Δ ms/secundă simulată p95 | % din bugetul de tick | % din bugetul main-thread | Contoare reale | Eșantioane | Zgomot |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| learning | o închidere de segment la fiecare 5 s simulate (două pe eșantion) | 2 | 40.424 | 0.135 | 8.085 | 1.69% | 0.68% | segments=2; activations=2 | 5 | peste zgomot |
| recorder | un apel pe tick; recorderul decimează intern la 20 Hz | 600 | 0.204 | 0.204 | 12.244 | 2.55% | 1.02% | peakChargedBytes=1395200; samplesRecorded=200 | 5 | peste zgomot |
| kpi | settle + review la fiecare 1 s simulată, snapshot agregat la 10 Hz | 120 | 0.119 | 0.024 | 1.431 | 0.3% | 0.12% | settlements=10; reviews=10 | 5 | peste zgomot |
| xp | fereastră activă de 30 s + citire la 10 Hz | 102 | 0.146 | 0.025 | 1.485 | 0.31% | 0.13% | windows=2; entries=2 | 5 | peste zgomot |
| challenges | advance per tick + o încercare completă la fiecare 10 s simulate | 603 | 0.076 | 0.076 | 4.57 | 0.95% | 0.38% | attempts=1; credits=1 | 5 | peste zgomot |
| destruction | advance per tick + un impact la fiecare 50 de tick-uri | 612 | 0.057 | 0.058 | 3.504 | 0.73% | 0.29% | impacts=12; objects=35; brokenObjects=7 | 5 | peste zgomot |

## Baseline înainte de optimizări

Captura `20261022T005309189Z` din 2026-10-22T01:06:04.388Z, commit `2d68b43c8cdf`, sourceHash `4df3a6ba76c6`.

Build de producție pe laptopul identificat (Ryzen 7 7735U / Radeon 680M), preset LOW fix, 1920×1080 CSS și intern, DPR 1, cinci repetări 30 s + 120 s; captură din 22 octombrie 2026, **înainte** de corecțiile 220 (priming înainte de warmup, context 044 la 10 Hz fazat, cache de rutare mărginit).

| Metrică | Valori pe repetări | Buget | Verdict |
| --- | ---: | ---: | --- |
| tick autoritar p95, workload maxim V1 30/40, WEBGPU | p50 7.6, p95 10.4, max 10.4 | ≤ 8 ms | FAIL |

baseline-ul documentat depășește bugetul (10.4 > 8); se păstrează ca dovadă a stării dinainte de optimizare

## Abateri

Niciuna dintre metricile măsurate nu depășește bugetul citat.

## Ce nu a putut fi măsurat

| Metrică | Motiv | Măsurat în schimb |
| --- | --- | --- |
| lucru GPU p95 (laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · scaling-20) | timer GPU indisponibil: unavailable: timer query unsupported; valoarea rămâne null, nu 0 | distribuțiile celorlalte metrici din aceeași configurație |
| lucru GPU p95 (laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · normal-24) | timer GPU indisponibil: unavailable: timer query unsupported; valoarea rămâne null, nu 0 | distribuțiile celorlalte metrici din aceeași configurație |
| lucru GPU p95 (laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · maximum-30) | timer GPU indisponibil: unavailable: timer query unsupported; valoarea rămâne null, nu 0 | distribuțiile celorlalte metrici din aceeași configurație |
| lucru GPU p95 (laptop · WEBGPU · LOW_FIXED_220_FLEET · 1920×1080 intern · overload-30-80) | timer GPU indisponibil: unavailable: timer query unsupported; valoarea rămâne null, nu 0 | distribuțiile celorlalte metrici din aceeași configurație |
| memoria exactă a paginii și a GPU (laptop) | API-ul de memorie exactă (page/GPU) nu este disponibil; se raportează heap-ul JS și contoarele de ownership, fără însumarea categoriilor suprapuse | performance.memory.usedJSHeapSize și contoare de ownership |
| pornire la prima comandă acceptată, cold p95 (joc complet) | intrarea de producție src/main.ts nu compune o cursă completă (scenă de bootstrap); nu există „prima comandă acceptată” de măsurat fără a inventa pagina de joc | bytes reali ai build-ului de producție |

Verdictul acoperă numai metricile măsurate pe configurația fixată; gate-ul hardware al jocului complet rămâne NOT_VALIDATED.
