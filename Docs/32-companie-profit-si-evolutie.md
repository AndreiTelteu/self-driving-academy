# Companie: profit și evoluție

Versiune 0.2 · 26 noiembrie 2026. **Propunere de design cu boundary V1 confirmat prin PBI 268.** Ledgerul de costuri, profitul, cash-ul și P&L-ul lunar sunt implementate separat de revenue-ul 209; valorile numerice rămân propuneri de calibrare, iar evoluția companiei (269) și panoul (270) rămân neimplementate. Revenue-ul și ratingurile din [KPI-uri și economie](22-kpi-economie-si-review-uri.md) nu sunt modificate de companie.

## De ce există acest document

Documentația actuală definește **revenue**, nu profit:

- [Docs/22](22-kpi-economie-si-review-uri.md) spune explicit că revenue-ul este încasarea după rambursări și **nu** profit după costuri de operare.
- [Manualul 04](manual/04-kpi-si-economie.md) spune că nu se scad costuri de operare, combustibil sau salarii.
- Nu există nicio entitate „companie”, nici cash, costuri, achiziții, upgrade-uri sau valoare de flotă.
- XP-ul și nivelul jucătorului din [Docs/23](23-misiuni-zilnice-si-experienta.md) sunt progres personal, nu evoluția financiară a companiei.

Această propunere separă cele trei noțiuni: **revenue** (încasare), **profit** (rezultat după costuri) și **evoluție** (cum se reinvestește profitul în flotă).

## Definiții

| Concept | Definiție | Sursă |
| --- | --- | --- |
| Revenue | Încasările curselor, după rambursări | Contractul 209 existent |
| Cost de operare | Cheltuiala atribuită unei curse sau unei perioade | Nou, propus aici |
| Profit | `revenue - costuri de operare` | Nou, propus aici |
| Cash | Numerarul disponibil al companiei | Nou, propus aici |
| Valoare flotă | Suma valorilor de achiziție rămase ale vehiculelor | Nou, propus aici |
| Nivel companie | Praguri cumulative de profit reinvestit | Nou, propus aici |

Profitul poate fi negativ. Cash-ul nu poate fi negativ; o achiziție sau un upgrade care ar produce cash negativ este refuzat. Profitul negativ **nu** retrage XP și nu coboară nivelul jucătorului.

## Boundary implementat în 268 (26 noiembrie 2026)

Implementarea V1 a modelului financiar este în `src/economy/company-finance.ts` și este montată live prin `src/main.ts`:

- `CompanyLedger` este un ledger separat, cu `268-company-ledger-v1`; el nu are referință către ledgerul 209, review-uri, KPI sau ledgerul XP. Revenue-ul este copiat dintr-un settle 209 acceptat, iar compania nu apelează nicio metodă de scriere a acestuia.
- Fiecare cursă terminală produce exact o intrare de cost imutabilă, cheia de idempotență fiind `rideId`. O a doua livrare este `DUPLICATE` și nu schimbă nimic.
- Categoriile de cost pe cursă sunt `ENERGY`, `MAINTENANCE`, `INCIDENT` și `SERVICE`; fiecare are propriul `costModelVersion`. Costurile fixe lunare sunt `INSURANCE`, `SALARIES` și `LICENSES`.
- O anulare fără pasager păstrează intrarea brută și adaugă o ajustare explicită `SERVICE_NOT_DELIVERED`; un refund explicit este o ajustare separată care referă intrarea originală. Istoricul nu este rescris.
- Costurile fixe se aplică o singură dată per lună simulată. O lună fără curse are un bucket real cu `terminalRides: 0`, cost fix și profit negativ, nu `NO_DATA`.
- `profit = revenue - netCost`, unde `netCost = grossCost + adjustments`. Cash-ul este `initialCash + profit`, plafonat la zero; pierderea neacoperită este raportată separat. Nu există operație de achiziție sau upgrade (269).
- Citirea este incrementală (`historyScans: 0`) și expune `xpWrites: 0`, `economyWrites: 0`, `investmentWrites: 0`. Profitul negativ nu are cale către XP.

Read model-ul live este `createLiveCompanyFinance` (`268-live-company-finance-v1`), alimentat de rezultatele terminale deja acceptate ale economiei 266. El citește numărul real de impacturi 028 din `review.evidence.impacts`; fără dovezi de review nu inventează un incident. Portul `company` al shell-ului și read model-ul `company()` sunt disponibile pentru proba de browser; panoul rămâne 270.

Valorile implicite sunt în `DEFAULT_COMPANY_COST_SCHEDULE` și sunt **propuneri de calibrare**: 60 SDA/km energie, 45 SDA/km mentenanță, 2 500 SDA/incident, 40 SDA/cursă serviciu, 1 200 SDA/lună asigurări, 2 400 SDA/lună salarii, 400 SDA/lună licențe și 50 000 SDA cash inițial. Ele nu sunt tarife reale și nu modifică tariful 209.

Dovezile sunt în [Evidence/268-company-finance](Evidence/268-company-finance/README.md): raport determinist cu 50/50 verificări, cost de simulare separat și proba de browser (`NOT_RUN` când Playwright lipsește).

## Formula propusă

```text
profit_cursă = revenue_cursă - cost_energie - cost_mentenanță - cost_incident - cost_serviciu
profit_lună  = Σ profit_cursă + ajustări - costuri_fixe_lunare
cash_nou     = cash_vechi + profit_lună - investiții
```

Boundary-ul 268 implementează primele două linii fără termenul de investiții: ajustările sunt semnate, iar costurile fixe sunt aplicabile și fără curse. Investițiile rămân 269.

Costurile fixe lunare sunt propuse separat de curse, ca să nu depindă de o singură livrare:

```text
costuri_fixe_lunare = asigurări + salarii/contractori + licențe + întreținere planificată
```

Valorile numerice rămân propuneri de calibrare. Nu se inventează tarife sau costuri „reale” în documentație.

## Categorii de cost propuse

| Categorie | Unitate | Se aplică | Observații |
| --- | --- | --- | --- |
| Energie/combustibil | SDA/km | Fiecare cursă | Depinde de clasă și de stilul de condus |
| Mentenanță | SDA/km | Fiecare cursă | Crește cu kilometrajul și cu incidentele |
| Incident | SDA/incident | Cursă sau eveniment | Coliziune, daună, recuperare |
| Serviciu | SDA/cursă | Cursă terminală | Taxa de service pentru anulări cu pasager |
| Asigurare | SDA/lună simulată | Perioadă | Cost fix, versionat |
| Salarii/contractori | SDA/lună simulată | Perioadă | Cost fix, versionat |
| Licențe/operare | SDA/lună simulată | Perioadă | Cost fix, versionat |
| Investiții | SDA/achiziție | Eveniment | Neimplementat în 268; rămâne 269 |

Primele șapte categorii sunt implementate în 268. Fiecare categorie are `costModelVersion`, iar fiecare intrare păstrează versiunea categoriei cu care a fost produsă; o schimbare de model nu rescrie intrările deja stocate. Investițiile nu au încă nicio intrare și niciun efect asupra cash-ului.

## Ledger și raportare

- `CompanyLedger` este separat de ledgerul de revenue 209 și de ledgerul XP 213. El nu importă niciunul dintre cele două.
- O intrare de cursă are `entryId`, `rideId`, `revenueSettlementId`, `tick`, `costModelVersion` și câte o linie versionată pentru fiecare categorie; o intrare fixă are `periodId`, categoria și suma lunară.
- O cursă terminală produce o singură intrare de cost, idempotentă, legată de `rideId`; fiecare intrare are câte o linie pentru energie, mentenanță, incident și serviciu.
- Rambursările și anulările sunt ajustări semnate care referă intrarea originală; intrarea brută rămâne neschimbată.
- Raportarea lunară păstrează separat revenue, costuri pe categorie, ajustări, profit și completitudinea perioadei. Valoarea flotei nu este calculată în 268; ea depinde de 269.
- O lună fără curse poate avea profit negativ din costuri fixe; nu este „date insuficiente”, este un rezultat real. Un bucket absent rămâne `null`/fără date.
- `historyScans` rămâne `0`; raportarea citește agregate, nu replays-uiește ledgerul.

## Evoluția companiei

Evoluția propusă are trei componente, toate opționale și versionate:

1. **Nivel companie** — praguri cumulative de profit reinvestit, separate de nivelul de XP. Nivelul companiei nu se calculează din XP și nu scade XP.
2. **Achiziții** — vehicule noi adăugate în flotă, cu clasă, cost și slot. O achiziție nu inventează un vehicul existent; respectă capacitatea flotei.
3. **Upgrade-uri** — îmbunătățiri declarate (de exemplu mentenanță mai ieftină, confort, eficiență). Fiecare upgrade are efecte măsurabile, plafonate și versionate; nu ascunde un bonus de tip „pay-to-win” în afara contractelor de fizică și KPI.

Un upgrade nu modifică pe ascuns stilul învățat. Dacă afectează un parametru de driving, o face printr-o versiune de profil cu proveniență explicită, nu printr-un override invizibil.

## Interfață propusă

- Panou „Companie” cu: cash, revenue, costuri, profit, valoare flotă, nivel companie.
- Grafic lunar revenue/costuri/profit și tabel cu perioade.
- Detaliere pe categorie de cost și pe cursă.
- Listă de achiziții/upgrade-uri cu cost, efect, stare și confirmare.
- Mesaje explicite pentru „fonduri insuficiente”, „nivel insuficient”, „upgrade deja deținut”.
- Accesibilitate conform [ui-accessibility](ui-accessibility.md), fără listeners globali.

## Separarea de XP și de stil

- Profitul, cash-ul și nivelul companiei sunt consecințe economice; nu au cale către ledgerul XP.
- Un profit negativ nu retrage XP, nu coboară nivelul jucătorului și nu șterge profilul învățat.
- Un upgrade de companie nu este o demonstrație LEARNING și nu produce dovezi de stil.
- Un import de profil nu resetează compania; un import de sesiune poate înlocui compania numai prin contractul de savefile, cu preview și confirmare.

## Scenarii de acceptare

1. **Implementat 268.** O cursă `COMPLETED` produce revenue, costuri și profit o singură dată; un duplicat nu schimbă nimic.
2. **Implementat 268.** O cursă `FAILED` sau `CANCELLED` fără pasager nu inventează revenue; costurile aplicabile sunt explicite, iar serviciul se anulează printr-o ajustare.
3. **Implementat 268.** O lună cu costuri fixe și zero curse are profit negativ real, afișat ca atare, nu „fără date”.
4. **Rămâne 269.** O achiziție cu cash insuficient este refuzată; cash-ul rămâne neschimbat.
5. **Rămâne 269.** Un upgrade aplicat reduce costul declarat, iar efectul este vizibil în următoarea perioadă, fără rescrierea istoricului.
6. **Implementat 268.** Profitul negativ, un accident și o misiune eșuată lasă soldul XP și nivelul jucătorului identice.
7. **Rămâne 278.** Reload-ul păstrează compania, iar un import de sesiune o înlocuiește atomic, după confirmare.
8. **Implementat structural 268.** `historyScans` rămâne `0` în read model-ul companiei; panoul companiei rămâne 270.

## Decizii deschise

- **Decis 268:** categoriile V1 sunt energie, mentenanță, incident, serviciu, asigurări, salarii și licențe; investițiile rămân 269.
- **Decis 268:** salariile și licențele sunt costuri fixe per companie, per lună simulată.
- **Decis 268:** cash-ul este plafonat la zero, iar pierderea neacoperită este raportată separat; falimentul și soarta flotei rămân 269.
- Dacă upgrade-urile pot afecta fizica sau numai costurile/serviciul rămâne 269.
- Dacă nivelul companiei deblochează clase de vehicule deja existente sau numai achiziții rămâne 269.
- Valorile de calibrare rămân propuneri; moneda rămâne `SDA`.

## Legături

- [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md)
- [Flotă și curse](07-flota-si-curse.md)
- [Misiuni și progres](13-misiuni-si-progres.md)
- [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md)
- [Salvare și integritate](29-savefile-si-integritate.md)
- [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)
- [Dovezile 268](Evidence/268-company-finance/README.md)
- [Backlogul curent](../PBI/README.md)

## Corespondență în backlog

- `268` — modelul de finanțe al companiei: costuri, profit, cash, P&L.
- `269` — evoluția companiei: nivel, achiziții, upgrade-uri.
- `270` — panoul companiei: grafice, costuri, achiziții.

Boundary-ul 268 este implementat și verificat în [Evidence/268-company-finance](Evidence/268-company-finance/README.md). 269 și 270 rămân taskuri viitoare; valorile de calibrare nu sunt certificate și pot fi revizuite printr-o versiune nouă de schedule, fără rescrierea istoricului.
