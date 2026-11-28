# 284 — Traficul civil complet autonom și preluarea oricărei mașini

Implementare locală verificată de sub-agent la 28 noiembrie 2026. Boardul canonic, mutarea PBI în
Done și publicarea rămân ale orchestratorului.

## Ce s-a livrat

- **Autonomia civilă completă:** fiecare civil live primește același cadru 044 și aceleași comenzi
  283 ca taxiurile. Contextul publicat include semnalele 036 reale și amprentele 032 ale zonelor de
  serviciu; `completeness.signals` este `true` când adaptorul 283 rulează. Obstacolele destructibile
  rămân 285, iar pietonii 286.
- **Recuperarea 054 executată:** `holdCommand` nu mai arunca cererea `REQUEST_REROUTE`; 058 o
  primește, o execută prin plannerul 041 și raportează `noteRecovery(..., true)`.
- **Preluare G:** orice taxi/civil AI poate fi preluat, nu doar cu `M` din panoul flotei. Intrarea
  suspendă ruta 058 exact la poza curentă; ieșirea reconciliază poza condusă și revine în AUTO.
- **Fără teleport pe drum:** când poza de ieșire este pe graf, saltul este sub 1 m (0,725 m în proba
  Chromium, 0,000009 m în raportul determinist). Dacă poza este off-graph, actorul revine totuși în
  AUTO la ultima poziție reconciliată pe bandă, iar `EXIT_ACCEPTED` raportează motivul; această
  margine poate repoziționa mașina pe bandă și este declarată ca limitare, nu ascunsă.
- **Vehicul nou:** `addVehicle` acceptă `avoid`/`clearanceM`; achiziția live evită jucătorul, mașinile
  existente și decorul folosind aceeași căutare 041, fără un al doilea router. ID-ul rămâne unic prin
  registry.

## Dovezi

- [report.json](report.json) / [report.md](report.md) — 31/31 verificări deterministe pe 24 taxiuri +
  40 civili, 9 000 tick-uri: 126 semnale, 167 875 țineri de semnal civile, 40 714 țineri STOP,
  43 186 țineri yield, 4 schimbări de bandă aplicate, 0 deadlock; 64/64 actori se mișcă, 62/62 aflați
  la peste 80 m se mișcă. Preluare: rută identică, derivă 0 m, condus 8 m, salt 0,000009 m, reluare
  2,098 m. Recuperare 054: 1 episod, 2 cereri de reroute, 1 aplicată.
- [cost.json](cost.json) / [cost.md](cost.md) — 24/32/40 civili cu 20 taxiuri: p95 6,06 / 7,60 /
  6,80 ms, sub bugetul de 8 ms. Rândul 30 taxiuri + 40 civili este marcat `STRESS` și raportat separat
  (p95 9,11 ms), nu ascuns în gate-ul normal.
- [browser.json](browser.json) / [browser.md](browser.md) — Chrome, 13/13 verificări: civil AI oprit
  30 tick-uri, preluat MANUAL, rută suspendată cu derivă 0 m, condus 11,49 m, ieșire AUTO, salt
  0,725 m, aceeași rută/destinație, 2,02 m după reluare, 0 erori de pagină/consolă. Capturi:
  [oprit](screenshots/civil-stopped.png), [condus](screenshots/civil-driven.png),
  [reluat](screenshots/civil-resumed.png).

## Comenzi

```powershell
npm run civil:autonomy
npm run civil:autonomy -- --check
npm run civil:autonomy:cost
npm run civil:autonomy:cost -- --check
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run civil:autonomy:probe
```

## Limitări

- Proba de browser este fixture Chromium peste compunerea reală 032/033/058/283 cu canvas 2D, nu
  shell-ul Babylon randat; nu este un gate hardware/FPS.
- AI-ul nepreluat rămâne pe proxy-ul cinematic 058; fizica Rapier live se aplică mașinii conduse
  (282), nu întregii flote.
- Decorul destructibil (285), pietonii (286) și soak-ul complet rămân în afara scope-ului.
