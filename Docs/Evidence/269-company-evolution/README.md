# 269 — evoluția companiei: dovezi

Dovezile implementării `269-company-evolution-v1` și `269-live-company-evolution-v1` peste ledgerul
268, registry-ul real 057 și actorii live 058.

## Ce s-a probat

- **Raport determinist:** [report.json](report.json) și [report.md](report.md), produse de
  `npm run company:evolution` pe un ledger 268 determinist și pe registry-ul real. 66/66 verificări.
- **Nivel companie:** pragurile `0 / 5 000 / 15 000 / 35 000 / 70 000 / 120 000` SDA reinvestit sunt
  strict crescătoare; nivelul este 1 la zero și nu crește din profit simplu, ci numai după o
  investiție reală. O pierdere ulterioară păstrează nivelul 2 și high-water-ul de 5 220 SDA.
- **Achiziție:** `offer-city-compact-1` costă 12 000 SDA, reduce cash-ul de la 55 220 la 43 220 SDA și
  adaugă un taxi real în același registry, pe slotul 21 (de la 20 taxiuri). Vehiculul returnat există
  în registry, are clasa `compact` și primește actor 058 cu rută 041.
- **Upgrade:** `upgrade-service-contract` costă 8 000 SDA și aplică 5 000/10 000 din costul `SERVICE`
  de la tick-ul 2 160 000 (`m0001`). Costul serviciului este 40 SDA în perioada curentă și 20 SDA în
  perioada următoare, cu baza de 40 SDA păstrată în linie; intrarea veche rămâne 40 SDA.
- **Refuzuri:** cash insuficient (`INSUFFICIENT_CASH`), nivel insuficient (`LEVEL_REQUIRED`) și
  deținere duplicată (`ALREADY_OWNED`) nu schimbă cash-ul, flota sau jurnalul de investiții.
- **Cash:** formula 269 este `initialCash + profit - investments`, plafonată la zero; formula 268
  rămâne disponibilă separat ca `cashBeforeInvestmentMinorUnits`. Raportul închide cu 14 000 SDA
  revenue, 6 110 SDA profit, 20 000 SDA investiții și 36 110 SDA cash.
- **Reload/import:** snapshot-ul cu 1 achiziție și 1 upgrade este restaurat pe un ledger 268
  reconstruit și pe un registry proaspăt: nivelul 2, cash-ul 35 655 SDA și slotul 21 rămân identice.
  Dacă flota a fost deja restaurată de 278 cu taxiul cumpărat, restore adoptă acel vehicul real în
  loc să mai adauge unul; dacă ledgerul 268 a fost restaurat deja cu investițiile 269, restore
  adoptă jurnalul fără să mai cheltuie cash-ul a doua oară. Restore refuză un ledger care nu are
  starea operațională 268 restaurată. Fișierul, reload-ul de browser și importul atomic de sesiune
  rămân 278.
- **Separare XP/stil:** soldul XP, nivelul jucătorului și intrările rămân identice; profilul de
  driving are același checksum. Contoarele structurale sunt `xpWrites: 0`, `profileWrites: 0`,
  `styleOverrides: 0`, `economyWrites: 0`, iar `historyScans` rămâne 0.
- **O singură flotă:** evoluția primește exact registry-ul 057 existent (`sameRegistry: true`,
  `secondFleet: false`). `tests/fleet/company-fleet-growth.test.ts` probează că actorul 058 nou
  intră în aceeași populație, cu rută reală și fără duplicate la o a doua cerere, iar
  `tests/app/ambient-traffic.test.ts` probează că taxiul cumpărat apare în același cadru al
  compunerii V3, cu slotul și clasa reale.
- **Cost de simulare:** [cost.json](cost.json) și [cost.md](cost.md), produse de
  `npm run company:evolution:cost`: read model p95 0,0192 ms, cursă cu modifier p95 0,0190 ms, sub
  bugetul de tick de 8 ms. Este un cost de subsistem headless, nu un certificat FPS/GPU/hardware.
- **Browser:** [browser.json](browser.json) și [browser.md](browser.md) sunt `NOT_RUN`, pentru că
  modulul `playwright` nu este instalat în checkout și `PLAYWRIGHT_MODULE` nu este setat. Nu este
  raportat niciun PASS simulat; lanțul live este probat determinist în raport și în testul 058.

## Comenzi

```powershell
npm run typecheck
npm run company:evolution
npm run company:evolution -- --check
npm run company:evolution:cost
npm run company:evolution:probe
npm test
```

## Limite

- Valorile de nivel, cost și efect sunt propuneri de calibrare, nu economie reală certificată.
- Valoarea flotei este suma valorilor de achiziție; nu există depreciere sau revânzare în V1.
- Upgrade-urile V1 reduc numai costuri operaționale; nu ating fizica, KPI-urile 209 sau profilul de
  driving.
- Panoul companiei rămâne 270, iar persistența în fișier, reload-ul și importul atomic de sesiune
  rămân 278.
- Proba de browser nu a rulat în acest mediu; nu înlocuiește un playtest uman și nu măsoară
  FPS/GPU/hardware.
