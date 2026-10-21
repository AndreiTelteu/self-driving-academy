# Dovezi 217 — cele trei moduri

Contract: [Docs/three-modes.md](../../three-modes.md) (`217-three-modes-v1`). Raport mașină: [report.json](report.json). Rezumat lizibil: [report.md](report.md).

## Ce s-a executat

| Comandă | Rezultat |
| --- | --- |
| `npm run modes:three` | preflight `npm test` PASS (1791 pass, 1 skip, 0 fail) apoi raport 28/28 verificări, 7/7 scenarii, matrice PASS; scrie `report.json` și `report.md` |
| `npm run modes:three -- --check` | PASS; forma normalizată (latență → 0) este identică cu raportul comis |
| `npm test` | 1792 teste, 1792 pass, 0 fail, 0 skip |
| `node --import ./scripts/register-typescript.mjs --test tests/app/three-modes.test.ts` | 20 teste, 20 pass |

Raportul comis: 12 rânduri de matrice (6 tranziții × TAXI/CIVIL), 8 segmente închise (4 MANUAL, 4 LEARNING),
1 scaun `PLAYER` maxim, 2 joburi reale 103, 2 versiuni 109 reale, 0 publicări din MANUAL, determinism PASS pe două rulări identice.

## Matrice și reguli verificate

| De la | La | Închide | Motiv | Deschide | Eligibil | Learning pe segmentul închis |
| --- | --- | --- | --- | --- | --- | --- |
| AUTO | MANUAL | — | — | MANUAL | `false` | — |
| AUTO | LEARNING | — | — | LEARNING | `true` | — |
| MANUAL | AUTO | MANUAL | `RETURN_TO_AUTO` | — | — | `SKIPPED_MANUAL`, fără job/versiune |
| MANUAL | LEARNING | MANUAL | `MODE_CHANGE` | LEARNING | `true` | `SKIPPED_MANUAL`, fără job/versiune |
| LEARNING | AUTO | LEARNING | `RETURN_TO_AUTO` | — | — | `COMPOSED`, versiune reală |
| LEARNING | MANUAL | LEARNING | `MODE_CHANGE` | MANUAL | `false` | `COMPOSED`, versiune reală |

Fiecare rând păstrează viteza și heading-ul identice și pasul de poziție `viteză/60 s` (eroare `0`),
are cel mult un scaun `PLAYER`, iar HUD-ul afișează eticheta modului acceptat.

## Latență locală (provizorie, dependentă de mașină)

Măsurată de `npm run modes:three` pe această mașină, într-un singur proces Node, fără lucru paralel:

| Canal | Eșantioane | min ms | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Intenție de mod → tranziție acceptată | 48 | 0.8227 | 1.1779 | 1.5128 | 1.7673 |
| Schimbare de selecție → ținta camerei | 200 | 0.3466 | 0.3704 | 0.5539 | 0.9057 |
| Închidere LEARNING → admitere coadă 103 (worker ocupat) | 200 | 0.1731 | 0.7098 | 0.9677 | 2.6495 |

Admiterea a fost măsurată cu un job secundar activ în toate cele 200 de eșantioane (`busySamples: 200`),
200 de admiteri reale și 0 joburi suplimentare din reluarea aceluiași segment.

Acestea NU sunt FPS, timp de frame, GPU sau hardware. Sunt valori locale, marcate `provisional: true`.

## Scenarii (7/7)

1. `taxi-auto-manual` — taxi AUTO↔MANUAL, hotkey real 080/067, HUD, scaun, segmente.
2. `civil-auto-learning` — civil AUTO↔LEARNING, aceleași contracte.
3. `mixed-ride` — taxi MANUAL, selecție explicită a civilului (doar cameră), LEARNING pe civil, revenire AUTO; `VEHICLE_SWITCH`, un singur scaun.
4. `pause-focus` — tastă ținută și intenție în așteptare eliminate la suspendare; tick contiguu la reluare; pierderea focusului suspendă în orice mod și reia același tick.
5. `remap` — `Digit1`/`Digit2` salvate prin 080; `KeyM` ignorat; modurile conduse de noile coduri.
6. `busy-worker` — admitere reală în 112 cu workerul ocupat; replay deduplicat, fără job dublu.
7. `selection-no-takeover` — camera se mută, scaunul rămâne al vehiculului condus, apoi preluare explicită.

## Probe negative

- discontinuitate fizică injectată → `PHYSICS_POSITION_STEP` / `PHYSICS_SPEED`;
- al doilea scaun injectat → `MULTIPLE_PLAYER_SEATS`;
- segment lipsă sau greșit → `MISSING_CLOSED_SEGMENT` / `WRONG_CLOSED_SEGMENT`.

## Limitări

- Fizica scenei este o citire deterministă cu viteză constantă; nu este o simulare Rapier.
- Estimatoarele 094–101 rulează în worker; harness-ul folosește blend-ul real 101, nu re-estimează stilul.
- Fără captură de browser, fără pretenție de FPS/GPU/hardware; integrarea vizuală completă rămâne gate-ul de release.
- Valorile de latență sunt excluse din egalitatea `--check` prin normalizare la `0`; raportul comis păstrează numerele reale.
