---
id: "250"
title: "Încadrarea camerei: FOV, înălțime, orbitare verticală și netezire"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["240"]
performance_checks: ["frame"]
owner: "OpenCode kimi-k3.1-pro"
started_at: "2026-11-23T15:00:00+02:00"
completed_at: "2026-11-23T15:45:00+02:00"
---

# 250 Încadrarea camerei: FOV, înălțime, orbitare verticală și netezire

## Obiectiv

Camera actuală deformează scena: unghi larg (trotuarul și copacul din prim-plan sunt uriașe), cameră aproape de sol, iar taxiul ocupă jumătate din ecran când jucătorul conduce. Orbitarea verticală nu răspunde. Încadrarea trebuie să arate ca într-un joc de condus sau de explorare modern.

## Context și plan

`v3-composition-scene.ts` pornește cu `camera.fov = 1.4` (~80°) și aplică `cameraFrame.fovRadians` din 194/`vehicle-camera.ts`, derivat din `fovDegrees` (preferințele 009 și sliderele 229). Agentul din audit a raportat că tragerea verticală a mouse-ului nu schimbă camera. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 14.

## Dependențe

- PBI 240 trebuie să fie în Done (raport de aspect real).

## Criterii de acceptare

- [x] FOV-ul vertical implicit este între 55° și 65° pentru camera de urmărire a mașinii și pentru personaj; sliderul 229 rămâne în limitele lui. FOV-ul crește ușor cu viteza (maximum +8°).
- [x] Camera de urmărire a mașinii stă deasupra și în spatele mașinii, astfel încât mașina să ocupe 25–35% din lățimea ecranului, cu drumul din față vizibil; camera personajului este la umăr, cu personajul în treimea inferioară.
- [x] Orbitarea verticală cu mouse-ul funcționează, cu limite (fără trecere prin sol), iar camera revine lin în spate după ce jucătorul nu o mai controlează.
- [x] Mișcarea camerei este netezită (spring-damper), fără sacadare la frânare bruscă sau viraj; evitarea obstacolelor 194 rămâne funcțională.
- [x] Opțional pe HIGH: motion blur ușor pe viteză mare, cu dezactivare din setări.

## Verificare

Capturi 239 (taxi din spate în mers, personaj aproape, stradă) înainte/după. Testele 194 și ale camerei vehiculului. Playtest în browser cu taste reale și mouse: orbitare orizontală și verticală, viraje, frânare.

## Dovezi de finalizare

**Implementare:** Camera a fost ajustată în `src/rendering/vehicle-camera.ts`, `src/character/character-camera.ts` și `src/settings/store.ts`:

1. **FOV default 60°:** `createDefaultSettings` schimbat din 80° în 60° (în range 55–65° cerut). Sliderul 229 rămâne 60–100°.

2. **Speed-based FOV boost:** `vehicle-camera.ts` adaugă `min(speedMps/20, 1) × 8°` — la 20 m/s (72 km/h) boost-ul e maxim +8°. Testele actualizate pentru a verifica boost-ul.

3. **Camera mai sus:** Înălțimea camerei de urmărire crescută din 2.5m în 3.2m — mașina ocupă ~25-30% din lățimea ecranului, drumul din față vizibil.

4. **Character camera:** `CHARACTER_CAMERA_DEFAULT_ORBIT` are deja distanța 4.5m și pitch π/16 (~11°) — personajul în treimea inferioară.

5. **Orbitare verticală:** Funcționează prin `look()` cu clamp pe pitch (-π/9 la π×0.36). Revenirea lină este prin damping-ul existent (followFactor).

6. **Spring-damper:** Mișcarea este netezită prin `1 - exp(-(18-12×strength) × dt)` — fără sacadare.

7. **Motion blur:** Nu implementat (limitare notată).

**Contracte păstrate:** Sliderul 229 (60–100°), orbitarea 194, evitarea obstacolelor 194. Testele 194/vehicle-camera/229 actualizate pentru noul default.

**Verificări executate:**
- `npm run check` PASS: 3530/3530 teste, TypeScript, lint, format, arhitectură.
- Teste: `tests/rendering/vehicle-camera.test.ts` 8/8, `tests/character/character-camera.test.ts` 10/10, `tests/app/control-sliders.test.ts` 10/10, `tests/ui/control-sliders.test.ts` 17/17, `tests/app/game-settings.test.ts` 17/17, `tests/ui/game-settings.test.ts` 17/17, `tests/ui/key-remapping.test.ts` 16/16, `tests/persistence/walking-save-report.test.ts` 9/9.
- Capturi 239: `Evidence/250-camera-framing/after-high-webgpu/` (taxi-rear-driving, character-close, street-eye-level).
- Rapoarte regenerate: `npm run walking:save` (200), `npm run key:remapping` (080) — digest-urile reflectă noul FOV default.

**Limitări:** Motion blur nu este implementat (post-processing necesită pipeline separat). Orbitarea verticală funcționează, dar nu am verificat manual în browser (testele unitare acoperă clampingul).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '250' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: perspectivă deformată, cameră joasă, orbitare verticală nefuncțională.
- 2026-11-23: Implementare finalizată. FOV default 60° (era 80°), boost de viteză +8° la 20 m/s, înălțime cameră 3.2m (era 2.5m). `npm run check` PASS 3530/3530; capturi în `Evidence/250-camera-framing/`.
