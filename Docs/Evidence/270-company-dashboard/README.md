# 270 — panoul companiei: dovezi

Dovezile implementării `270-company-dashboard-v1` și `270-company-dashboard-panel-v1` peste read
model-urile 268/269. Panoul este o proiecție: nu are ledger, flotă sau store propriu, iar achizițiile
și upgrade-urile cheamă exact porturile existente ale evoluției.

## Ce s-a probat

- **Raport determinist:** [report.json](report.json) și [report.md](report.md), produse de
  `npm run company:dashboard` peste ledgerul real 268 și evoluția reală 269. **33/33** verificări.
- **Indicatori:** revenue 16 000 SDA, costuri 10 900 SDA, profit 5 100 SDA, cash 55 100 SDA,
  valoare de flotă 0 SDA și nivel 1 înainte de investiții; toate vin din `finance.totals`, `cash` și
  `companyLevel`, nu dintr-un al doilea calcul.
- **Zero vs. fără date:** fereastra are trei luni, dintre care luna 1 nu are bucket și rămâne
  `NO_DATA` / „fără date” cu valori `null`; luna 2 are revenue real `0 SDA` și profit real
  `-4 000 SDA`, ambele afișate ca atare. Graficul și tabelul folosesc aceleași valori lunare.
- **Achiziție:** oferta `offer-city-compact-1` costă 12 000 SDA, cash-ul scade de la 55 100 la
  43 100 SDA, flota trece de la 20 la 21 de taxiuri, iar nivelul companiei urcă de la 1 la 2.
  Confirmarea afișează costul și efectul înainte de execuție.
- **Upgrade:** `upgrade-service-contract` costă 8 000 SDA, este disponibil la nivelul 2 și
  înregistrează efectul `SERVICE × 5 000 bp` din luna următoare. Costul de service al lunii 0 este
  800 SDA pentru 20 curse; în luna următoare, 4 curse costă 80 SDA în loc de 160, iar profitul lunii
  următoare este 700 SDA din revenue 5 200 SDA și costuri 4 500 SDA.
- **Refuzuri:** fondurile insuficiente (cash 10 000 SDA pentru o ofertă de 12 000) blochează butonul
  și nu schimbă cash-ul sau flota; o ofertă cu nivel cerut 2 este blocată la nivelul 1; un upgrade
  deținut este refuzat explicit. Un refuz venit de la portul real (`ALREADY_OWNED`) este afișat în
  panou și resincronizează view-ul la starea `OWNED`.
- **Cost și accesibilitate:** dialogul are 2 listeneri, zero listeneri globali, focus pe „Închide”,
  Tab/Shift+Tab în panou, Escape prin suprafața 070 și restaurarea focusului. Panoul închis nu
  citește și nu randează; deschis citește la 10 Hz. `historyScans` rămâne `0`, iar contoarele XP,
  economy și profil rămân `0`.
- **Browser:** [browser.json](browser.json) și [browser.md](browser.md), produse de
  `npm run company:dashboard:probe` cu Playwright/Chrome. **29/29** verificări pe două pagini reale:
  fixture-ul cu modulele reale 268/269/270 (deschidere, Tab, Escape, cumpărare taxi, upgrade,
  următoarea lună) și buildul live `index.html` (butonul nativ `Companie` din shell, suprafața 070,
  citiri zero cât timp panoul este închis). Capturile sunt
  [01-company-dashboard.png](screenshots/01-company-dashboard.png) și
  [02-live-shell-company.png](screenshots/02-live-shell-company.png).

## Comenzi

```powershell
npm run typecheck
npm run lint
npm run format:check
node --import ./scripts/register-typescript.mjs --test tests/ui/company-dashboard.test.ts
npm run company:dashboard
npm run company:dashboard -- --check
$env:PLAYWRIGHT_MODULE='C:\Users\aandr\Sites\exim-pilot\web\node_modules\playwright'
npm run company:dashboard:probe
npm test
npm run build
npm run check:architecture
npm run composition:report -- --check
npm run docs:check -- --check
```

## Limite

- Valorile de cost, nivel și efect rămân propuneri de calibrare, nu economie reală certificată.
- Valoarea flotei este suma valorilor de achiziție; nu există depreciere sau revânzare în V1.
- Proba de fixture rulează modulele reale 268/269/270 într-o pagină Chrome, nu o lume Babylon
  completă; proba live deschide buildul real și verifică montarea, suprafața și focusul, dar nu
  cumpără upgrade-ul în lumea live, pentru că starea live nu are nivelul și profitul pregătite.
- Panoul nu implementează pop-up-ul KPI (267), persistența/reload-ul (278), fizica (282) sau
  learning-ul. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
- Node local este 24.19.0, sub intervalul declarat `>=24.21.0 <25`; comenzile au rulat, dar
  avertizarea de engine rămâne.
