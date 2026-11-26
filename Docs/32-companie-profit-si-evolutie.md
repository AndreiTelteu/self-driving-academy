# Companie: profit și evoluție

Versiune 0.4 · 27 noiembrie 2026. **Boundary V1 confirmat prin PBI 268, extins prin PBI 269 și expus prin PBI 270.** Ledgerul de costuri, profitul, cash-ul și P&L-ul lunar sunt implementate separat de revenue-ul 209; nivelul companiei, achizițiile de vehicule și upgrade-urile versionate sunt implementate peste același ledger, iar panoul companiei citește aceleași read model-uri. Valorile numerice rămân propuneri de calibrare, iar persistarea în fișier după reload rămâne 278. Revenue-ul și ratingurile din [KPI-uri și economie](22-kpi-economie-si-review-uri.md) nu sunt modificate de companie.

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
| Valoare flotă | Suma valorilor de achiziție rămase ale vehiculelor | Implementat 269 ca valoare de achiziție, fără depreciere |
| Nivel companie | Praguri cumulative de profit reinvestit | Implementat 269, separat de XP |

Profitul poate fi negativ. Cash-ul nu poate fi negativ; o achiziție sau un upgrade care ar produce cash negativ este refuzat. Profitul negativ **nu** retrage XP și nu coboară nivelul jucătorului.

## Boundary implementat în 268 (26 noiembrie 2026)

Implementarea V1 a modelului financiar este în `src/economy/company-finance.ts` și este montată live prin `src/main.ts`:

- `CompanyLedger` este un ledger separat, cu `268-company-ledger-v1`; el nu are referință către ledgerul 209, review-uri, KPI sau ledgerul XP. Revenue-ul este copiat dintr-un settle 209 acceptat, iar compania nu apelează nicio metodă de scriere a acestuia.
- Fiecare cursă terminală produce exact o intrare de cost imutabilă, cheia de idempotență fiind `rideId`. O a doua livrare este `DUPLICATE` și nu schimbă nimic.
- Categoriile de cost pe cursă sunt `ENERGY`, `MAINTENANCE`, `INCIDENT` și `SERVICE`; fiecare are propriul `costModelVersion`. Costurile fixe lunare sunt `INSURANCE`, `SALARIES` și `LICENSES`.
- O anulare fără pasager păstrează intrarea brută și adaugă o ajustare explicită `SERVICE_NOT_DELIVERED`; un refund explicit este o ajustare separată care referă intrarea originală. Istoricul nu este rescris.
- Costurile fixe se aplică o singură dată per lună simulată. O lună fără curse are un bucket real cu `terminalRides: 0`, cost fix și profit negativ, nu `NO_DATA`.
- `profit = revenue - netCost`, unde `netCost = grossCost + adjustments`. Boundary-ul 268 raporta cash-ul ca `initialCash + profit`, plafonat la zero; 269 păstrează `cashBeforeInvestmentMinorUnits` cu aceeași formulă și scade investițiile separat. Pierderea neacoperită este raportată separat.
- Citirea este incrementală (`historyScans: 0`) și expune `xpWrites: 0`, `economyWrites: 0`; `investmentWrites` numără doar investițiile 269 din același ledger (0 când nu există investiții). Profitul negativ nu are cale către XP.

Read model-ul live este `createLiveCompanyFinance` (`268-live-company-finance-v1`), alimentat de rezultatele terminale deja acceptate ale economiei 266. El citește numărul real de impacturi 028 din `review.evidence.impacts`; fără dovezi de review nu inventează un incident. Portul `company` al shell-ului și read model-ul `company()` sunt disponibile pentru panoul 270 și proba de browser.

Valorile implicite sunt în `DEFAULT_COMPANY_COST_SCHEDULE` și sunt **propuneri de calibrare**: 60 SDA/km energie, 45 SDA/km mentenanță, 2 500 SDA/incident, 40 SDA/cursă serviciu, 1 200 SDA/lună asigurări, 2 400 SDA/lună salarii, 400 SDA/lună licențe și 50 000 SDA cash inițial. Ele nu sunt tarife reale și nu modifică tariful 209.

Dovezile sunt în [Evidence/268-company-finance](Evidence/268-company-finance/README.md): raport determinist cu 50/50 verificări, cost de simulare separat și proba de browser (`NOT_RUN` când Playwright lipsește).

## Boundary implementat în 269 (26 noiembrie 2026)

Evoluția companiei este în `src/economy/company-evolution.ts` (`269-company-evolution-v1`) și folosește **exact ledgerul 268**, extins cu un jurnal de investiții și cu modificatori de cost versionați. Nu există un al doilea ledger, un al doilea registry sau un store de XP/profil.

- **Nivel companie.** Nivelul este o funcție pură de `reinvestedProfitMinorUnits = min(investmentMinorUnits, profitHighWaterMinorUnits)`; ambele componente sunt monotonice, deci nivelul nu scade după o pierdere. Profitul singur nu ridică nivelul: banii trebuie reinvestiți printr-o achiziție sau un upgrade. Nivelul XP nu este citit și nu este scris; `companyLevelFor` nu are nicio dependență de `PlayerProgress`.
- **Praguri (propuneri de calibrare).** Nivel 1 la 0, nivel 2 la 5 000, nivel 3 la 15 000, nivel 4 la 35 000, nivel 5 la 70 000 și nivel 6 la 120 000 SDA reinvestiți. Tabelul este `269-company-levels-v1`.
- **Achiziții.** Șase oferte one-time (`269-company-vehicle-catalog-v1`), fiecare cu clasă reală 023 (`sedan`/`compact`), cost și nivel cerut. O achiziție acceptată cheltuie cash-ul, adaugă taxiul în **același registry 057** și pornește actorul real 058 cu o rută 041; slotul returnat de registry este păstrat, iar capacitatea de 30 taxiuri este respectată. A doua achiziție a aceleiași oferte este `ALREADY_OWNED`.
- **Upgrade-uri.** Cinci upgrade-uri (`269-company-upgrade-catalog-v1`), fiecare cu cost, nivel cerut și un efect plafonat între 5 000 și 10 000 basis points. Efectul este o reducere a unei singure categorii de cost, începe la **începutul lunii simulate următoare** și este înregistrat ca `CompanyCostModifierEntry` versionat în ledger. Intrările de cost deja existente nu sunt rescrise; următoarea perioadă folosește baza și basis points în linia nouă.
- **Cash.** `cash = max(0, initialCash + profit - investments)`, iar `cashBeforeInvestmentMinorUnits = max(0, initialCash + profit)` păstrează formula 268. O achiziție sau un upgrade care ar depăși cash-ul este refuzat cu `INSUFFICIENT_CASH` și nu schimbă nici cash-ul, nici flota, nici jurnalul. Refuzurile sunt închise: `INSUFFICIENT_CASH`, `LEVEL_REQUIRED`, `ALREADY_OWNED`, `FLEET_UNAVAILABLE`, `FLEET_CAPACITY`, `FLEET_REFUSED`, `LEDGER_REJECTED`, `INVALID_OFFER`, `INVALID_INPUT`.
- **Read model live.** `createLiveCompanyEvolution` (`269-live-company-evolution-v1`) citește tick-ul autoritar din finance-ul 268 și expune `company().evolution`: nivel, cash, oferte, upgrade-uri, efecte pending, refuzuri, contoare și read model-ul 268 complet. `companyPurchase`/`companyUpgrade` sunt comanda pe care o apelează panoul 270; ele nu scriu XP, profil sau ledgerul 209.
- **Persistență.** Evoluția expune `snapshot()`/`restore()` (`269-company-evolution-snapshot-v1`). Restore cere ca ledgerul 268 să fie deja restaurat (aceeași stare operațională) și fie reia jurnalul 269 pe registry-ul real, fie adoptă investițiile și vehiculele deja restaurate de 278, verificând cash-ul, nivelul și slotul. Fișierul de save, reload-ul și importul atomic de sesiune rămân 278; 269 nu inventează un al doilea savefile.

Dovezile sunt în [Evidence/269-company-evolution](Evidence/269-company-evolution/README.md): raport determinist 66/66, cost de simulare separat, testul de creștere a populației 058 și proba de browser (`NOT_RUN` când Playwright lipsește).

## Interfață implementată în 270 (27 noiembrie 2026)

Panoul companiei este o **proiecție** a read model-urilor 268/269: `src/ui/company-dashboard-format.ts` (`270-company-dashboard-v1`) transformă `company().evolution` în text, tabele și bare, iar `src/ui/company-dashboard.ts` (`270-company-dashboard-panel-v1`) montează dialogul. El nu are ledger, flotă, store sau ceas propriu; achizițiile și upgrade-urile cheamă exact porturile `companyPurchase`/`companyUpgrade` ale evoluției 269.

- **Indicatori:** revenue, costuri nete, profit, cash, valoare de flotă și nivel companie, toate din `finance.totals`, `cash` și `companyLevel`. Profitul negativ este marcat, nu ascuns.
- **Luni:** fereastra implicită este de 12 luni simulate, construită din `finance.months`. O lună fără bucket este `NO_DATA` cu valori `null` și text „fără date”; un zero real rămâne `0 SDA`, iar un profit negativ real rămâne negativ. Graficul și tabelul folosesc aceeași listă ordonată de luni, fără medii ale mediilor.
- **Costuri:** tabel pe cele șapte categorii cu ultima lună, totalul ferestrei și ponderea; ultima cursă costată are detalierea pe categorie și cantitate.
- **Investiții:** fiecare ofertă și upgrade afișează costul, efectul și starea. O acțiune disponibilă cere confirmare în panou; fondurile insuficiente, nivelul insuficient și deținerea duplicată sunt refuzuri explicite, iar butonul este blocat. Refuzul venit de la port este afișat cu codul și detaliul lui.
- **Accesibilitate și cost:** butonul nativ `Companie` este montat în `src/ui/game-shell-host.ts`; dialogul are nume, focus mutat pe „Închide”, Tab/Shift+Tab ținute în panou, Escape prin portul de suprafață și restaurarea focusului. Nu există listeneri pe `window`/`document`. Panoul citește la 10 Hz numai cât timp este deschis; închis, `update()` și `refresh()` întorc `SKIPPED_CLOSED` fără citire și fără randare.
- **Pauză:** suprafața `panel` este decisă tot de 070 prin shell, ca la celelalte panouri; panoul nu suspendă singur ceasul și nu schimbă modul de control.
- **Separare:** panoul nu scrie XP, profil, stil sau ledgerul 209. `historyScans` rămâne structural `0`.

Dovezile sunt în [Evidence/270-company-dashboard](Evidence/270-company-dashboard/README.md): raport determinist, probă de browser pe fixture și pe buildul live, plus testele de proiecție, zero vs. fără date, refuz și focus.

## Formula propusă

```text
profit_cursă = revenue_cursă - cost_energie - cost_mentenanță - cost_incident - cost_serviciu
profit_lună  = Σ profit_cursă + ajustări - costuri_fixe_lunare
cash_nou     = cash_vechi + profit_lună - investiții
```

Boundary-ul 268 implementează primele două linii; 269 adaugă termenul de investiții, păstrând separat `cashBeforeInvestmentMinorUnits` cu formula 268. Ajustările sunt semnate, iar costurile fixe sunt aplicabile și fără curse.

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
| Investiții | SDA/achiziție | Eveniment | Implementat 269 ca ieșire de cash, nu cost de operare |

Primele șapte categorii sunt implementate în 268. Fiecare categorie are `costModelVersion`, iar fiecare intrare păstrează versiunea categoriei cu care a fost produsă; o schimbare de model nu rescrie intrările deja stocate. Investițiile 269 sunt intrări separate, cu `investmentModelVersion`, și nu sunt contabilizate ca profit sau ca o categorie de cost operațional.

## Ledger și raportare

- `CompanyLedger` este separat de ledgerul de revenue 209 și de ledgerul XP 213. El nu importă niciunul dintre cele două.
- O intrare de cursă are `entryId`, `rideId`, `revenueSettlementId`, `tick`, `costModelVersion` și câte o linie versionată pentru fiecare categorie; o intrare fixă are `periodId`, categoria și suma lunară.
- O cursă terminală produce o singură intrare de cost, idempotentă, legată de `rideId`; fiecare intrare are câte o linie pentru energie, mentenanță, incident și serviciu.
- Rambursările și anulările sunt ajustări semnate care referă intrarea originală; intrarea brută rămâne neschimbată.
- Raportarea lunară păstrează separat revenue, costuri pe categorie, ajustări, profit și completitudinea perioadei. Valoarea flotei nu este calculată în 268; ea depinde de 269.
- O lună fără curse poate avea profit negativ din costuri fixe; nu este „date insuficiente”, este un rezultat real. Un bucket absent rămâne `null`/fără date.
- `historyScans` rămâne `0`; raportarea citește agregate, nu replays-uiește ledgerul.

## Evoluția companiei

Evoluția are trei componente, toate implementate și versionate în 269:

1. **Nivel companie** — praguri cumulative de profit reinvestit, separate de nivelul de XP. Nivelul companiei nu se calculează din XP și nu scade XP.
2. **Achiziții** — vehicule noi adăugate în flotă, cu clasă, cost și slot. O achiziție nu inventează un vehicul existent; respectă capacitatea flotei.
3. **Upgrade-uri** — îmbunătățiri declarate (mentenanță, serviciu, energie, asigurări, incidente). Fiecare upgrade are efecte măsurabile, plafonate la 50% și versionate; nu ascunde un bonus de tip „pay-to-win” în afara contractelor de cost.

Un upgrade nu modifică pe ascuns stilul învățat. Efectele 269 sunt exclusiv reduceri de cost în ledgerul companiei, aplicate de la începutul perioadei următoare; ele nu creează o versiune de `DrivingProfile` și nu scriu în store-ul de profil. Dacă un upgrade viitor va afecta un parametru de driving, va trebui să treacă printr-o versiune de profil cu proveniență explicită, nu printr-un override invizibil.

## Interfață implementată

- Panou „Companie” cu: cash, revenue, costuri, profit, valoare flotă, nivel companie.
- Grafic lunar revenue/costuri/profit și tabel cu perioade; aceleași agregate în ambele.
- Detaliere pe categorie de cost și pe ultima cursă costată.
- Listă de achiziții/upgrade-uri cu cost, efect, stare și confirmare.
- Mesaje explicite pentru „fonduri insuficiente”, „nivel insuficient”, „upgrade deja deținut”.
- Accesibilitate conform [ui-accessibility](ui-accessibility.md), fără listeners globali.

Read model-ul care alimentează panoul este `company().evolution`: `companyLevel`, `cash`, `fleet` (inclusiv vehiculele cumpărate, slotul și starea de actor live), `offers`/`upgrades` cu starea și refuzul fiecăruia, `pendingEffects`, `refusals` și read model-ul 268 `finance`. Panoul 270 nu are o a doua sursă de adevăr.

## Separarea de XP și de stil

- Profitul, cash-ul și nivelul companiei sunt consecințe economice; nu au cale către ledgerul XP.
- Un profit negativ nu retrage XP, nu coboară nivelul jucătorului și nu șterge profilul învățat.
- Un upgrade de companie nu este o demonstrație LEARNING și nu produce dovezi de stil.
- Un import de profil nu resetează compania; un import de sesiune poate înlocui compania numai prin contractul de savefile, cu preview și confirmare.

## Scenarii de acceptare

1. **Implementat 268.** O cursă `COMPLETED` produce revenue, costuri și profit o singură dată; un duplicat nu schimbă nimic.
2. **Implementat 268.** O cursă `FAILED` sau `CANCELLED` fără pasager nu inventează revenue; costurile aplicabile sunt explicite, iar serviciul se anulează printr-o ajustare.
3. **Implementat 268.** O lună cu costuri fixe și zero curse are profit negativ real, afișat ca atare, nu „fără date”.
4. **Implementat 269.** O achiziție cu cash insuficient este refuzată; cash-ul, flota și jurnalul rămân neschimbate.
5. **Implementat 269.** Un upgrade aplicat reduce costul declarat de la începutul perioadei următoare, iar intrarea istorică rămâne neschimbată.
6. **Implementat 268.** Profitul negativ, un accident și o misiune eșuată lasă soldul XP și nivelul jucătorului identice.
7. **Rămâne 278.** Reload-ul păstrează compania, iar un import de sesiune o înlocuiește atomic, după confirmare. 269 expune `snapshot()`/`restore()` și verifică slotul, cash-ul și nivelul, dar fișierul și reload-ul rămân 278.
8. **Implementat 270.** Panoul afișează revenue, costuri, profit, cash, valoare de flotă și nivel; o lună fără date nu este zero, iar un profit zero sau negativ real rămâne vizibil. `historyScans` rămâne `0`, panoul închis nu citește ledgerul, iar cumpărările/upgrade-urile trec prin porturile 269 cu confirmare și refuzuri explicite.

## Decizii deschise

- **Decis 268:** categoriile V1 sunt energie, mentenanță, incident, serviciu, asigurări, salarii și licențe; investițiile au fost implementate separat în 269.
- **Decis 268:** salariile și licențele sunt costuri fixe per companie, per lună simulată.
- **Decis 268:** cash-ul este plafonat la zero, iar pierderea neacoperită este raportată separat; falimentul și soarta flotei la pierdere rămân un follow-up, nu sunt implementate de 269.
- **Decis 269:** upgrade-urile V1 afectează numai costurile operaționale, plafonat și versionat; nu ating fizica, KPI-urile 209 sau profilul de driving.
- **Decis 269:** nivelul companiei condiționează ofertele de achiziție și upgrade-uri, dar nu blochează clasele de vehicule deja existente și nu elimină accesul la taxiurile existente.
- Valorile de calibrare rămân propuneri; moneda rămâne `SDA`.

## Legături

- [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md)
- [Flotă și curse](07-flota-si-curse.md)
- [Misiuni și progres](13-misiuni-si-progres.md)
- [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md)
- [Salvare și integritate](29-savefile-si-integritate.md)
- [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)
- [Dovezile 268](Evidence/268-company-finance/README.md)
- [Dovezile 269](Evidence/269-company-evolution/README.md)
- [Dovezile 270](Evidence/270-company-dashboard/README.md)
- [Backlogul curent](../PBI/README.md)

## Corespondență în backlog

- `268` — modelul de finanțe al companiei: costuri, profit, cash, P&L.
- `269` — evoluția companiei: nivel, achiziții, upgrade-uri.
- `270` — panoul companiei: grafice, costuri, achiziții.

Boundary-urile 268, 269 și 270 sunt implementate și verificate în [Evidence/268-company-finance](Evidence/268-company-finance/README.md), [Evidence/269-company-evolution](Evidence/269-company-evolution/README.md) și [Evidence/270-company-dashboard](Evidence/270-company-dashboard/README.md). Persistența de fișier/reload 278 rămâne task viitor; valorile de calibrare nu sunt certificate și pot fi revizuite printr-o versiune nouă de schedule sau catalog, fără rescrierea istoricului.
