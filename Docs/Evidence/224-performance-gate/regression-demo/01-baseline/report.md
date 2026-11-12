# PBI 224 — raport agregat al gate-ului de regresii de performanță

Verdict structural: `PASS` · verdict de release: `NOT_VALIDATED` · revizie `757e7168dfd6` · manifest `203-initial-1` (nemodificat).

## Sumar

- Probe: **16 PASS**, **0 FAIL**, 1 NOT_VALIDATED
- Repetări: 5/5; cele 5 repetări produc aceiași bytes și aceeași probă structurală (variație 0)
- Hardware FPS: măsurat pe revizia `2d68b43c8cdf`; revizie diferită

## Probe și motive

| Probă | Criteriu | Fel | Verdict | Detaliu | Motiv | Dovadă |
| --- | --- | --- | --- | --- | --- | --- |
| bundle-critical-transfer · bundle JS+WASM sub capacitatea critică de transfer | Criteriul 1: bundle-ul și capacitățile resping depășirile | PORTABLE | `PASS` | 5.84 MiB (6125279 B) din 8.00 MiB; JS 3478683 B + WASM 2646596 B, gzip 1769518 B, 130 artefacte | — | Docs/performance-budgets.json proposedCapacities.criticalJsWasmTransferBytes |
| bundle-regression · bundle-ul nu crește peste pragul relativ confirmat | Criteriul 1: bundle-ul și capacitățile resping depășirile | PORTABLE | `PASS` | baseline 5.84 MiB (f5fb79fd07c7); 0/5 repetări peste >10% și >5.00 MiB; prag de confirmare 3/5 | — | Docs/Evidence/155-hardware-budget/build-transfer.json + Docs/performance-budgets.json regressionProposal |
| capacity-render · draw calls, instanțe și obiecte Babylon sub capacitățile fixate | Criteriul 1: capacități structurale peste buget sunt respinse | PORTABLE | `PASS` | draw calls 48/128, instanțe thin 78/8192, batchuri 40/512, obiecte Babylon 12/4096, 923 elemente randate | — | Docs/performance-budgets.json resourceAdmissionContracts.rendering |
| determinism · cinci repetări produc aceiași bytes și aceeași probă structurală | Criteriul 1: capacități structurale peste buget sunt respinse | PORTABLE | `PASS` | 5 builduri, 5 probe de randare; digesturi distincte: 1 build / 1 randare | — | repetițiile gate-ului |
| soak-60min · soak de minimum 60 de minute și 20 de cicluri, cu platou | Criteriul 3: soak de minimum 60 de minute, 20 de cicluri, platou, baseline neschimbat | EVIDENCE | `PASS` | 60.001 min, 20 cicluri (20 curate), 7/7 tendințe PLATEAU, heap +1.82 MiB din 5.00 MiB, coadă max 1 joburi / 4 B, throttling OBSERVED | — | Docs/Evidence/224-performance-gate/soak/report.json |
| fps-hardware · FPS și frame p95 pe hardware real, pe aceeași revizie și ambele backenduri | Criteriul 1: gate-ul FPS se închide numai pe hardware real, aceeași revizie | EVIDENCE | `NOT_VALIDATED` | — | capturile hardware 220 din Docs/Evidence/155-hardware-budget/report.json sunt pe buildul 2d68b43c8cdf; revizia curentă este 757e7168dfd6. Pragurile absolute FPS/GPU (35 ms p95, 28 ms GPU) cer aceeași revizie, deci FPS rămâne NOT_VALIDATED până la o rulare pe hardware real al acestei revizii. | Docs/Evidence/155-hardware-budget/report.json |
| probe-render-budget · proba 157 (buget de randare) este curentă față de sursă | Criteriul 1: capacități structurale peste buget sunt respinse | EVIDENCE | `PASS` | 157: 17 PASS, 0 FAIL, 2 NOT_MEASURED; --check exit 0, captura 546fa29e5ac6 | — | Docs/Evidence/157-render-budget/report.json |
| probe-simulation-budget · proba 158 (buget de simulare) este curentă față de sursă | Criteriul 2: learning, recorder, autosave, KPI și XP pe workload maxim V1 și ambele backenduri | EVIDENCE | `PASS` | 158: decizii PASS, estimare PASS, transferuri PASS, 3 echivalențe IDENTICAL; --check exit 0 | — | Docs/Evidence/158-simulation-budget/report.json |
| probe-traffic-benchmark · proba 156 (benchmark de flotă/trafic) este curentă față de sursă | Criteriul 2: learning, recorder, autosave, KPI și XP pe workload maxim V1 și ambele backenduri | EVIDENCE | `PASS` | 156: 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED; --check exit 0 | — | Docs/Evidence/156-traffic-benchmark/report.json |
| probe-hardware-budget · proba 155 (hardware și bugete) este curentă față de sursă | Criteriul 2: learning, recorder, autosave, KPI și XP pe workload maxim V1 și ambele backenduri | EVIDENCE | `PASS` | 155: 85 PASS, 0 FAIL, 6 NOT_MEASURED declarate; --check exit 0 | — | Docs/Evidence/155-hardware-budget/report.json |
| probe-soak-integrity · raportul soak 159 este curent față de măsurătoarea comisă | Criteriul 3: soak de minimum 60 de minute, 20 de cicluri, platou, baseline neschimbat | EVIDENCE | `PASS` | 159: SOAK_PASS, 60.002 min, 20 cicluri, commit 917a7de9; --check exit 0 | — | Docs/Evidence/159-soak/report.json |
| gameplay-systems-max-v1 · learning, recorder+autosave și XP trec pe workload maxim V1 (156) | Criteriul 2: learning, recorder, autosave, KPI și XP pe workload maxim V1 și ambele backenduri | EVIDENCE | `PASS` | workload maxim V1 30/40: 12 rânduri de gate, sisteme BASELINE, LEARNING, RECORDER_AUTOSAVE, XP, tick p95 maxim 7.00 ms din 8 ms | — | Docs/Evidence/156-traffic-benchmark/report.json |
| destruction-effects-audio · distrugere, efecte și audio în buget (227/228/149) | Criteriul 4: distrugere, efecte și audio în buget | EVIDENCE | `PASS` | 227: 24/24 verificări, 20 cicluri de reset cu 35 corpuri; 228: 20/20, max 4 voci impact și 24 reacții/incident; 149: 32/32, 1/14 voci active. Frame: NOT_MEASURED declarat | — | Docs/Evidence/227-destructible-decor/report.json, Docs/Evidence/228-destruction-feedback/report.json, Docs/Evidence/149-audio-feedback/report.json |
| challenge-director · directorul de provocări random și experiența în buget (232/233) | Criteriul 4: directorul de provocări random în buget | EVIDENCE | `PASS` | 232: 56/56, istoric 24/24 intrări și 1071/4096 unități; 233: 55/55, 1 rând de ledger din 32, 0 listeners globali | — | Docs/Evidence/232-challenge-director/report.json, Docs/Evidence/233-challenge-experience/report.json |
| savefile-integrity · encode/canonicalizare/hash de savefile în buget (234) | Criteriul 4: encode/canonicalizare/hash de savefile în buget | EVIDENCE | `PASS` | 234: 84/84 verificări, fișier 174732 B din 12285272 B, payload 174113 B din ingress 16777216 B, checksum 64 B; encode/hash fără ceas de perete (declarat) | — | Docs/Evidence/234-savefile/report.json |
| academy-chaos-cycles · 20 de schimbări Academie/Haos și 20 de reseturi în buget (225/226) | Criteriul 4: 20 de schimbări Academie/Haos/reset în buget | EVIDENCE | `PASS` | 225: 20 tranziții (10 Academie / 10 Haos), 20 checkpointuri comise, 773 B total (max 40 B), 0 lumi/joburi orfane; 226: 20 reseturi, 0 eșuate, corpuri 64, 1 listener, lumi vii 1 | — | Docs/Evidence/225-session-kinds/report.json, Docs/Evidence/226-world-recovery/report.json |
| backend-matrix · matricea WEBGPU + WEBGL 2 este declarată (154) | Criteriul 2/4: ambele backenduri sunt declarate, nu presupuse | EVIDENCE | `PASS` | 154: 9/9 combinații reale, 11/11 verificări deterministe, 11 combinații declarate NOT_RUN; backenduri acoperite: WEBGPU și WEBGL 2 | — | Docs/Evidence/154-compat-matrix/report.json |

## Stabilitate pe repetări

- Bytes per repetare: 6125279 B · 6125279 B · 6125279 B · 6125279 B · 6125279 B
- Digesturi de randare: `b6c188a777eb626e` · `b6c188a777eb626e` · `b6c188a777eb626e` · `b6c188a777eb626e` · `b6c188a777eb626e`
- cele 5 repetări produc aceiași bytes și aceeași probă structurală (variație 0)

## Ce rămâne deschis

- **fps-hardware** (Criteriul 1: gate-ul FPS se închide numai pe hardware real, aceeași revizie): capturile hardware 220 din Docs/Evidence/155-hardware-budget/report.json sunt pe buildul 2d68b43c8cdf; revizia curentă este 757e7168dfd6. Pragurile absolute FPS/GPU (35 ms p95, 28 ms GPU) cer aceeași revizie, deci FPS rămâne NOT_VALIDATED până la o rulare pe hardware real al acestei revizii.

Verdictul structural acoperă probele portabile ale reviziei curente. Verdictul de release poate fi PASS numai când nicio probă obligatorie nu este NOT_VALIDATED; fără GPU real, FPS rămâne deschis.
