# PBI052 — testul adaptorului WebGPU (rezultat negativ, 2026-10-19)

Încercare mărginită de a scoate calea WebGPU de pe D3D12, ca să testăm ipoteza că stall-ul de prezentare
(214 ms, doar pe WebGPU, scenă goală) vine din calea D3D12→driver. **Rezultat: flag-urile nu schimbă
backend-ul Dawn pe acest Chrome; nu s-a rulat nicio probă, pentru că nimic nu s-a schimbat.**

## Metodă

Chrome pornit cu flag-ul candidat, apoi citit `chrome://gpu` prin CDP (parcurgere shadow-DOM) și
`navigator.gpu.requestAdapter()` din pagina fixturii. Toate măsurătorile sunt read-only.

## Rezultate

| Configurație | `Dawn Info` (chrome://gpu) |
| --- | --- |
| implicit | `<Integrated GPU> **D3D12** backend - AMD Radeon(TM) Graphics` |
| `--use-webgpu-adapter=vulkan` | `<Integrated GPU> **D3D12** backend - AMD Radeon(TM) Graphics` |
| `--use-webgpu-adapter=d3d11` | `<Integrated GPU> **D3D12** backend - AMD Radeon(TM) Graphics` |
| `--enable-features=Vulkan` | `<Integrated GPU> **D3D12** backend - AMD Radeon(TM) Graphics` |

Adaptor raportat de pagină (`navigator.gpu`): `vendor amd`, `architecture rdna-2`, features
`depth32float-stencil8, rg11b10ufloat-renderable, bgra8unorm-storage, texture-formats-tier1,
texture-compression-bc, dual-source-blending`. UA: `Chrome/155.0.0.0`.

`chrome://gpu` listează și feature-ul `webgpu_on_vk_via_gl_interop` („Disable webgpu on vk via gl
interop“), ceea ce sugerează că WebGPU-pe-Vulkan există doar prin interop GL și nu e activat de aceste
flag-uri.

## Concluzie

Pe `Chrome 155.0.8059.84` backend-ul Dawn rămâne **D3D12** indiferent de flag-urile încercate. Nu pot
schimba calea de prezentare din flag-uri, deci ipoteza „present path D3D12“ nu poate fi testată astfel.
Nu am rulat smoke-ul: configurația ar fi fost identică cu cele deja documentate.

## Limite

- Nu pot distinge „flag necunoscut“ de „flag recunoscut dar ignorat pentru acest GPU/OS“; ambele produc
  același rezultat observat.
- Un singur build de Chrome, o singură mașină. WebGPU-pe-Vulkan pe Windows poate să nu fie deloc conectat
  pentru acest adaptor.

## Următorii discriminatori (nescanați)

1. Alt build Chromium — **Edge 155.0.4283.62** este deja instalat (`C:\Program Files (x86)\Microsoft\
   Edge\Application\msedge.exe`); separă „regresie Chrome 155/Dawn“ de „driver AMD“. Diagnostic mai întâi,
   nu probă de acceptare.
2. HAGS on/off (necesită interacțiune/reboot).
3. Driver AMD actualizat pentru 680M (acțiune externă).
4. Altă mașină/CI cu GPU — singurul răspuns definitiv, dar cu identitate de mediu nouă.

Artefacte: `probe-gpu-page2.mjs` (citește `Dawn Info`), `probe-adapter.mjs` (adaptor + features). Logurile
serverului din această încercare sunt în copia din worktree `.worktrees/yield-policy-01/.../v7-adapter-probe-01`.
