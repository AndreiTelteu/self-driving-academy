---
id: "258"
title: "Repară înălțimea vehiculelor, animația personajului și dispariția la intrare"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["254"]
performance_checks: ["frame"]
owner: "OpenCode deepseek-v4.1-flash"
started_at: "2026-11-25T22:21:27+02:00"
completed_at: "2026-11-25T22:52:07+02:00"
---

# 258 Repară înălțimea vehiculelor, animația personajului și dispariția la intrare

## Obiectiv

Repară cele trei regresii găsite la playtest după 252/255: mașina intra jumătate în asfalt, personajul nu avea animație de mers, iar după intrarea în mașină playerul rămânea înghețat pe stradă.

## Context și plan

- **Mașina în asfalt.** `visualTransform` copia poziția autoritativă a vehiculului (y=0 la sol) direct în rădăcina vizuală, dar contractul 145 așază șasiul la 0,8 m deasupra solului. Doar harnessul de capturi adăuga 0,8; în joc roțile și pragul dispăreau sub asfalt.
- **Fără animație.** `instantiateModelsToScene` aplică prefixul `character:` și numelor grupurilor de animație, iar `setClip` căuta `Idle_Standing`/`Walk_Relaxed` fără prefix. Nicio grupă nu pornea; personajul rămânea în poza de bind. În plus, clonarea skinned mesh-urilor (opțiunea veche) nu remapează corect țintele oaselor.
- **Player înghețat după intrare.** `CharacterScene.setVisible` exista, dar compunerea nu îl chema; rădăcina GLB rămânea activă la ultima poziție de pe trotuar după ce autoritatea trecea pe vehicul.

## Dependențe

- PBI 254 (personajul și vehiculele GLB) este Done.

## Criterii de acceptare

- [x] Vehiculul GLB stă pe asfalt la y=0: roata atinge solul, caroseria nu mai intră în suprafață.
- [x] Personajul are animații vizibile idle/walk/run; clipul de mers avansează cât timp W este ținut și revine la idle la oprire.
- [x] După intrarea în mașină, personajul este ascuns; reapare la ieșire.
- [x] Nicio schimbare în simulare, autoritate, collidere sau KPI/XP; numai prezentarea.
- [x] `npm run check` trece, iar probele de browser arată poziția, clipul și vizibilitatea.

## Verificare

- Playtest Playwright în browser cu WebGPU: mers cu W, citirea `clipId`/`speedMps`, intrare cu G, citirea autorității și `character:root.isEnabled()`.
- Capturi înainte/după pentru taxi și personaj.
- `npm run check`.

## Dovezi de finalizare

**Implementare.**
- `src/rendering/vehicle-visuals.ts`: `VEHICLE_RIDE_HEIGHT_M = 0.8`, cota de repaus a rădăcinii vizuale deasupra solului.
- `src/rendering/babylon/v3-composition-scene.ts`: `visualTransform` adaugă cota la y-ul autoritativ (0 la sol); `character.setVisible(frame.authority.consumer === 'CHARACTER')` la fiecare cadru, ca playerul să dispară la intrare și să reapară la ieșire.
- `src/rendering/babylon/glb-model-library.ts`: opțiunea `instantiate` separată de `cloneMaterials`; personajul se instanțiază (nu se clonează), deci scheletul și grupurile de animație se remapează corect.
- `src/rendering/babylon/character-scene.ts`: numele grupurilor de animație este normalizat (`character:Idle_Standing` → `Idle_Standing`) înainte de rutare; importurile Babylon au extensia `.js` pentru testele Node.
- `src/app/walking-composition.ts`: ancorarea camerei vehiculului primește aceeași cotă de 0,8 m, altfel camera rămânea la nivelul șasiului și caroseria umplea ecranul.
- Teste noi: `tests/rendering/vehicle-visuals.test.ts` (roata atinge solul la y=0) și `tests/rendering/character-clip-routing.test.ts` (prefixul clipurilor).

**Verificări de browser (Playwright, WebGPU `amd rdna-2`, 1280×720).** `Docs/Evidence/258-playtest-fixes/playtest/`:
- `01-walk.png` + `walk-probe.json`: W ținut 1,2 s → `clipId: walk`, `speedMps: 1,370967741935516`, poziția avansează de la x=9,8 la x=11,39; singurul grup activ este `character:Walk_Relaxed` (168 animatables, frame avansează). La oprire → `clipId: idle`, `character:Idle_Standing` activ.
- `02-entered.png` + `entry-probe.json`: G la spawn → `authority: VEHICLE:taxi-01`, `character:root.isEnabled() === false`, taxi la `y=0.8`, cele patru pivoturi de roată la `y=-0.5` local (centrul roții la 0,3 m world, talpa la ~0).
- `03-driving.png` + `entry-probe.json`: W 1,5 s → viteză 7,119 m/s, fără erori de consolă/pagină.
- `after-high-webgpu/`: capturi 239 `taxi-front-three-quarter`, `character-close`, `street-eye-level` cu taxiul pe asfalt și roțile vizibile.

**Verificări automate.** `npm run typecheck`, teste `vehicle-visuals` (7/7) și `character-clip-routing` (1/1) PASS. `npm run check` PASS: typecheck, lint, format, arhitectură și **3548/3548 teste** (inclusiv rapoartele 216 și 163 regenerate după adăugarea PBI 258 în graf).

**Documentație.** `Docs/16` — nota despre cota de 0,8 m și normalizarea numelor de clip; `PBI/Done/254` rămâne sursa pentru catalogul GLB.

**Limitări.** Modelul GLB al taxiului are caroseria într-un singur mesh, fără nod de ușă, deci **nu există animație de deschidere a ușii**; intrarea este instantă (personajul dispare, camera trece pe taxi). Nu am inventat o ușă procedurală peste caroserie. Camera de urmărire rămâne apropiată (vezi `03-driving.png`), dar șasiul și roțile sunt acum la cota corectă. Testul de clipuri verifică rutarea, nu calitatea artistică a animației importate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

## Istoric

- 2026-11-25: Creat din feedback-ul de playtest: mașina în asfalt, personaj fără animație, player vizibil după intrare.
