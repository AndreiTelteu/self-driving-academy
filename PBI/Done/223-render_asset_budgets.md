---
id: "223"
title: "Bugete de asseturi randare și calitate adaptivă"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["015","016","018","203","218"]
performance_checks: ["assets", "loading", "frame", "memory"]
owner: "Codex /root/render_223_resume"
started_at: "2026-10-05T10:03:09.8056607+03:00"
completed_at: "2026-10-05T13:22:38.5577576+03:00"
---

# 223 Bugete de asseturi randare și calitate adaptivă

## Obiectiv

Introduce de la scenele mici bugete de asseturi, batchuri locale, cache/disposal și adaptare exclusiv vizuală.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 016 trebuie să existe în Done înainte de începere.
- PBI 018 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Manifestul și verificarea asseturilor separă transferul, decode/WASM, resursele GPU estimate și costul primei utilizări; depășirile au diagnostic.
- [x] Instanțierea pe celule, LOD și materialele statice păstrează pickingul/entityId, semafoarele și mișcarea vehiculelor pe ambele backenduri.
- [x] DPR/rezoluția/umbrele și adaptarea cu histerezis sunt raportate; calitatea nu modifică fizica, mașinile, learning-ul, KPI-urile sau XP-ul.

## Verificare

Compară batch global/local și instanțe dinamice, cold/warm load, primele shadere, selecție distantă, schimbare de calitate și cicluri de dispose; verifică manifest supra-buget.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: Capuri finite `223-initial-1` în context `203-initial-1`, manifest/admitere cu diagnostice, geometrie/texturi și faze decode/shader/first-use separate, registry compatibil015, batchuri locale/LOD și actualizare atomică matrices→entityId. Geometry proprie per host elimină suprascrierea bufferelor între batchuri; static/dynamic și ownership/disposal rămân explicite. Limitele și adaptarea sunt exclusiv vizuale.

Verificări executate și rezultat: [Raport complet](../../Docs/Evidence/223-render-assets/verification.md) și [rezumat](../../Docs/Evidence/223-render-assets/summary.json): cinci perechi baseline/local-thin de 30 s warmup + minimum 120 s măsurate per braț pe Chrome 154 real, ambele backenduri, MEDIUM 1920×1080, Ryzen 7950X3D/RX7900XTX, focus/visibility/context verificate. Frame p95=7 ms pe ambele; CPU p95 mediană WebGPU 0,9→1 ms, WebGL2 0,8→0,8 ms; draw calls 4→19 sub 128; Long Tasks 0. Buffere 65.536→140.032 bytes sub 2 MiB, fără confirmări de regresie. Load/first-use în buget, supra-buget respins înainte de decode, picking/motion/reorder/removal/LOD și semafor mutabil, LOW 960×540→MEDIUM 1920×1080, adaptare separată și 20 cicluri cleanup PASS. Cinci teste 223, ESLint/Prettier pentru fișierele afectate, npm run typecheck, verificarea arhitecturii și verificarea provenienței PASS. Validate-Plan PASS după remedierea frontmatterului task-ului concurent 022.

Fișiere și documente actualizate: `src/rendering/asset-budgets.ts`, `babylon/cell-batches.ts`, registry/preflight/picking și exports, `quality-policy.ts`; teste223, fixture și server/analyzers; `Docs/render-asset-budgets.md`, asset-registry/lighting-quality/vehicle-picking și README; `Docs/Evidence/223-render-assets/`. Manifestul comun are `resourceAdmissionContracts.rendering` fixat de coordonator înaintea buildului.

Limitări sau follow-up: Fixture timpuriu cu70 proiecții, fără calibrarea gameplay-ului/orașului final/laptopului. GLB Blob cold/warm registry, fără profil de rețea25Mbit/s/RTT40ms sau cache driver/OS controlat. GPU timing/memorie exactă, heap total și workspace nativ indisponibile, fără valori0 fictive. Bufferele urmărite nu reprezintă totalul alocărilor Babylon. Exporterul CSS citea canvasul detașat și raporta[0,0]; rapoartele complete brute rămân intacte. Corecția post-măsurare pe canvasul live, HTML/capturi/smoke și reconstrucția exactă SHA256 dovedesc CSS1920×1080 și renderer/workload neschimbate; detalii în raport. Costurile suplimentare de drawcalls/obiecte sunt raportate, fără un câștig universal pretins. Gate-uri ulterioare145/146/150/220/224 obligatorii.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '223'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
- 2026-10-05: Reluat din coloana reală In Progress; codul și contractele existente au fost inspectate. Smoke-ul WebGPU a detectat Geometry partajată între hosturi; remediere verificată înaintea celor două protocoale complete. Corecția ulterioară a metadatelor CSS nu schimbă rendererul sau buclele măsurate, demonstrat prin SHA256 și smoke pe ambele backenduri. Verificările finale comune au trecut după corecțiile aplicate de ownerul 022 în propriul scope.

- 2026-10-05T13:22:38.5577576+03:00: Criteriile, protocoalele hardware și verificările finale au trecut; status Done și mutare fizică finalizate.
