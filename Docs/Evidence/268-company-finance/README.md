# 268 — modelul financiar al companiei: dovezi

Dovezile implementării `268-company-ledger-v1` și `268-live-company-finance-v1` peste cursele
reale 265 și settle-urile neschimbate 209.

## Ce s-a probat

- **Raport determinist:** [report.json](report.json) și [report.md](report.md), produse de
  `npm run company:finance` pe fixture-ul real de 24 taxiuri și 20 civili. 50/50 verificări.
- **Cursă profitabilă:** cursa reală `COMPLETED` are revenue 551 SDA, cost brut 148 SDA
  (energie 62, mentenanță 46, serviciu 40, incident 0) și profit brut 403 SDA.
- **Cursă în pierdere:** același traseu determinist cu un incident 028 real are cost de incident
  2 500 SDA, cost brut 2 648 SDA și profit brut −2 097 SDA; review-ul păstrează
  `evidence.impacts = 1` și ratingul 4.
- **Anulare:** cursa `CANCELLED` fără pasager are intrarea brută de 40 SDA și o ajustare explicită
  `SERVICE_NOT_DELIVERED` de −40 SDA; intrarea originală rămâne 40 SDA, iar costul net al cursei
  este 0.
- **Lună fără curse:** costurile fixe (1 200 asigurări + 2 400 salarii + 400 licențe) produc
  4 000 SDA cost, profit −4 000 SDA, `terminalRides: 0`, `hasRideData: false` și `PARTIAL`;
  luna nu este confundată cu lipsa datelor.
- **Idempotență:** a doua livrare a aceleiași curse este `DUPLICATE`, nu adaugă intrare și nu
  schimbă revenue-ul; costurile fixe se aplică o singură dată per lună.
- **Cash:** 50 000 SDA cash inițial, revenue 551, cost net 4 148, profit −3 597, cash 46 403.
  Formula este `initialCash + profit`, plafonată la zero, cu pierderea neacoperită raportată separat.
- **Separare 209/XP:** revenue-ul, settle-urile, review-urile și `historyScans` rămân identice
  înainte/după citirea companiei; soldul XP, nivelul și intrările rămân identice. Contoarele
  structurale `xpWrites`, `economyWrites` și `investmentWrites` sunt 0.
- **Boundary:** nu există `purchase`, `upgrade` sau altă operație de investiție; 269 rămâne separat.
- **Cost de simulare:** [cost.json](cost.json) și [cost.md](cost.md), produse de
  `npm run company:finance:cost`, măsoară pasul companiei pe fixture-ul real: p95 0,0157 ms la un
  buget de tick de 8 ms. Este un cost de subsistem headless, nu un certificat FPS/GPU/hardware.
- **Browser:** [browser.json](browser.json) și [browser.md](browser.md) sunt `NOT_RUN`, pentru că
  modulul `playwright` nu este instalat în checkout și `PLAYWRIGHT_MODULE` nu este setat. Nu este
  raportat niciun PASS simulat; lanțul real este probat determinist în raport.

## Comenzi

```powershell
npm run typecheck
npm run company:finance
npm run company:finance -- --check
npm run company:finance:cost
npm run company:finance:probe
npm test
```

## Limite

- Costurile folosesc distanța planificată a traseului 061 pentru o cursă cu pasager; 061 nu expune
  un odometru real. Valorile sunt propuneri de calibrare, nu tarife reale.
- Incidentul este citit din `review.evidence.impacts`; fără un review cu impact nu se inventează un
  cost de incident.
- Panoul companiei rămâne 270, evoluția/achizițiile rămân 269, iar persistarea după reload rămâne 278.
- Proba de browser nu a rulat în acest mediu; nu înlocuiește un playtest uman și nu măsoară
  FPS/GPU/hardware.
