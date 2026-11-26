# 262 — Flota live: taxiuri și civili simulați

PBI 262 extinde compunerea V3 de la 24 de civili AI la **24 de taxiuri + 32 de civili**, fiecare
actor real al contractului 058: ID stabil 057, clasă mecanică 023, rută 041 pe accesul categoriei,
context 044, following 048 și control 047 la 60 Hz.

## Ce s-a verificat

| Verificare | Rezultat |
| --- | --- |
| Populația normală | 24 taxiuri + 32 civili = 56 actori, toți în registry |
| Fixture-uri | 20/20, 24/32 și 30/40 (maximum 70) |
| ID-uri și clase | unice, `sedan`/`compact` reale 023 |
| Rute | 56/56 `READY`, 56/56 de la planner-ul 041 |
| Acces | taxi `TAXI`, civil `CIVIL` |
| Simulare în afara ferestrei de 80 m | 54/54 actori s-au deplasat; minim 65,91 m în 600 tick-uri |
| Profil comun | un singur `appliedProfileVersion` după refresh, același tick |
| Vehicul nou | taxiul și civilul nou creat citesc versiunea activă `v3-city-style-v2` |
| Spawn | unic pe bandă, 14,97 m de jucător, 14,60 m de vehiculele statice, zero perechi SAT suprapuse, gap decor 1,03 m |
| Determinism | același seed → aceleași ID-uri, benzi și poziții |
| Cleanup | actori, controlere, context rutier și registry la zero; `step` respins după dispose |
| Cost 70 vehicule | vezi [cost.json](cost.json); p95 5,82 ms din bugetul 8 ms |
| Browser | `NOT_RUN` — modulul Playwright nu este instalat în checkout; există doar binarele Chromium în cache |

## Fișiere

- [report.json](report.json) / [report.md](report.md) — transcript determinist, generat de
  `npm run fleet:live`; `npm run fleet:live -- --check` îl verifică.
- [cost.json](cost.json) — proba headless 40 civili vs. 70 vehicule, generată de
  `npm run fleet:live -- --measure`. Conține timpi reali, deci nu este comparată byte cu byte.
- `tests/app/ambient-traffic.test.ts` — integrarea în compunerea V3, mișcarea în afara camerei,
  profilul activ, spawn-ul sigur și cleanup-ul.
- `tests/fleet/live-fleet.test.ts` — contractul 058 extins la taxiuri și raportul comis.
- `tests/fleet/civil-traffic.test.ts` — suita 058 neschimbată.

## Comenzi

```powershell
npm run typecheck
npm run lint
npm run format:check
node --import ./scripts/register-typescript.mjs --test tests/fleet/civil-traffic.test.ts tests/fleet/live-fleet.test.ts tests/app/ambient-traffic.test.ts
npm run fleet:live -- --check
npm run fleet:live -- --measure
npm run docs:check -- --check
```

## Limite

- Proba de cost este headless, pe subsistemul 058, nu pe tick-ul complet și nu pe GPU. Bugetul de
  8 ms este cel de laptop din Docs/25; gate-ul hardware rămâne 287.
- Proba de browser nu a rulat în acest checkout din lipsa modulului Playwright. Comportamentul este
  acoperit de compunerea V3 reală în Node și de testele de mișcare în afara ferestrei.
- Taxiurile AI nu pot fi preluate; reconcilierea poziției și scaunul `PLAYER` rămân 263/284.
- Cursele, pickup-ul, dropoff-ul, ETA și economia rămân 264–268.
