# 282 — Fizica Rapier live

Dovezile sunt pentru integrarea live a adaptorului 022/024/028/029/030 în compunerea jucabilă.
PBI-ul rămâne In Progress până la integrarea și mutarea făcute de orchestrator.

## Comenzi

```powershell
npm run physics:live
npm run physics:live:probe
```

`physics:live` scrie `report.json` și `report.md` dintr-un fixture determinist: două corpuri
dinamice (sedan și compact), contact real, recuperare 030, paritate PLAYER/AUTONOMY și un fixture
normal V1 de 58 de vehicule cu 90 de obstacole de clădire. Costul este măsurat în perechi
baseline/fizică, nu prin înlocuirea baseline-ului.

`physics:live:probe` deschide buildul de producție în Chrome real (Playwright prin
`PLAYWRIGHT_MODULE`) și conduce cu taste reale: G, W, S, R, M. Fără Playwright, scrie explicit
`NOT_RUN`; nu inventează PASS.

## Rezultate curente

- `report.json`: 15/15 verificări. Paritatea PLAYER/AUTONOMY are diff maxim 0 pe 420 de tick-uri.
- Frânare de la 20 m/s: sedan 24,556 m, compact 22,550 m. Virajul cu aceeași comandă este mai
  strâns pentru compact.
- Contact: 1 incident 028/029, ambele mașini avariate, gap de centre 3,897 m, patru contacte de
  roți pe fiecare.
- Recuperare: `COMPLETED`, `TELEPORT`, learning ineligibil, viteză 0, availability `AVAILABLE`,
  un singur record în istoric.
- Schimbare MANUAL→AUTO: 0,1519 m, 0,0357 m/s, 0,00100 rad. Preluare vehicul: 0/0/0.
- Cost: pas Rapier p95 0,367 ms; tick de compunere p95 4,158 ms față de baseline-ul pereche
  3,886 ms pe fixture-ul normal V1 (buget 8 ms), incremental 0,272 ms. Targetul desktop de 5,5 ms
  este raportat separat; pe rularea finală a fost atins.
- `browser.json`: 10/10 în Chrome 157/WEBGL2. Frânare 4,68 m, impact cu gap 7,166 m, recuperare
  COMPLETED, AUTO/MANUAL fără salt. Costurile Chrome: tick p95 6,3 ms, Rapier p95 0,7 ms,
  frame p95 25,5 ms (ANGLE, nu gate hardware). Capturile sunt în `screenshots/`.

## Limite

- Costul este Node/Chrome pe desktopul disponibil; nu este un gate GPU/FPS sau laptop.
- Traficul 058 este reprezentat prin proxy-uri cinematice; 284 deține autonomia civilă completă.
- Decorul 026 rămâne resolverul static; colliderele Rapier numite acoperă clădirile și vehiculele.
- `baseline.json` este captura locală dinainte de implementare, fără commit publicat; comparația
  principală este perechea baseline/fizică din `report.json`.
