# Companie: profit și evoluție

Versiune 0.1 · 26 noiembrie 2026. **Propunere neconfirmată.** Documentul descrie o extensie cerută de utilizator, nu o funcționalitate livrată sau aprobată pentru V1. Până la confirmarea explicită, jocul rămâne la contractul din [KPI-uri și economie](22-kpi-economie-si-review-uri.md): revenue și ratings, fără costuri de operare și fără profit.

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

## Formula propusă

```text
profit_cursă = revenue_cursă - cost_energie - cost_mentenanță - cost_incident - cost_serviciu
profit_lună  = Σ profit_cursă + alte_venituri - costuri_fixe_lunare
cash_nou     = cash_vechi + profit_lună - investiții
```

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
| Investiții | SDA/achiziție | Eveniment | Vehicul nou sau upgrade |

Fiecare categorie are `costModelVersion`, iar o schimbare de model începe o serie nouă de raportare, fără să rescrie istoricul.

## Ledger și raportare

- `CompanyLedger` este separat de ledgerul de revenue 209 și de ledgerul XP 213.
- Fiecare intrare are `entryId`, `rideId` sau `periodId`, `category`, `amountMinorUnits`, `tick`/`period`, `costModelVersion` și referința tranzacției originale.
- O cursă terminală produce o singură decontare de cost, idempotentă, legată de `rideId`.
- Rambursările și anulările ajustează costul, nu rescriu istoricul.
- Raportarea lunară păstrează separat revenue, costuri, profit, cash și valoarea flotei.
- O lună fără curse poate avea profit negativ din costuri fixe; nu este „date insuficiente”, este un rezultat real.
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

## Scenarii de acceptare propuse

1. O cursă `COMPLETED` produce revenue, costuri și profit o singură dată; un duplicat nu schimbă nimic.
2. O cursă `FAILED` sau `CANCELLED` fără pasager nu inventează revenue; costurile aplicabile sunt explicite.
3. O lună cu costuri fixe și zero curse are profit negativ real, afișat ca atare, nu „fără date”.
4. O achiziție cu cash insuficient este refuzată; cash-ul rămâne neschimbat.
5. Un upgrade aplicat reduce costul declarat, iar efectul este vizibil în următoarea perioadă, fără rescrierea istoricului.
6. Profitul negativ, un accident și o misiune eșuată lasă soldul XP și nivelul jucătorului identice.
7. Reload-ul păstrează compania, iar un import de sesiune o înlocuiește atomic, după confirmare.
8. `historyScans` rămâne `0` după deschiderea panoului companiei.

## Decizii deschise

- Ce categorii de cost intră în V1 și care rămân extensii.
- Dacă salariile/contractorii sunt per taxi sau per companie.
- Dacă upgrade-urile pot afecta fizica sau numai costurile/serviciul.
- Dacă compania poate intra în faliment și ce se întâmplă cu flota.
- Dacă nivelul companiei deblochează clase de vehicule deja existente sau numai achiziții.
- Valorile de calibrare și moneda (rămâne `SDA`).

## Legături

- [KPI-uri, economie și review-uri](22-kpi-economie-si-review-uri.md)
- [Flotă și curse](07-flota-si-curse.md)
- [Misiuni și progres](13-misiuni-si-progres.md)
- [Misiuni zilnice și XP](23-misiuni-zilnice-si-experienta.md)
- [Salvare și integritate](29-savefile-si-integritate.md)
- [Starea implementării și lacunele](31-stare-implementare-si-lacune.md)
- [Backlogul curent](../PBI/README.md)

## Corespondență în backlog

- `268` — modelul de finanțe al companiei: costuri, profit, cash, P&L.
- `269` — evoluția companiei: nivel, achiziții, upgrade-uri.
- `270` — panoul companiei: grafice, costuri, achiziții.

Până la confirmarea acestei propuneri, taskurile rămân în To Do și nu se declară funcționalitate V1.
