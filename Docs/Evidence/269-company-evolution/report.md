# 269 — evoluția companiei

Raport determinist generat de `npm run company:evolution`.

Contract `269-company-evolution-v1` / `269-live-company-evolution-v1`; ledger `268-company-ledger-v1`.
Pragurile, costurile și efectele sunt propuneri de calibrare, nu valori economice reale.

## Nivel companie

Pragurile sunt cumulative pe profitul reinvestit, separate de XP. Nivelul crește numai după o
investiție reală și nu scade după o pierdere.

| Nivel | Prag reinvestit (SDA) |
| ---: | ---: |
| 1 | 0 |
| 2 | 5000 |
| 3 | 15000 |
| 4 | 35000 |
| 5 | 70000 |
| 6 | 120000 |

## Achiziție reală

| Metric | Value |
| --- | ---: |
| Ofertă | `offer-city-compact-1` |
| Cost | 12000 SDA |
| Cash înainte | 55220 SDA |
| Cash după | 43220 SDA |
| Taxiuri înainte/după | 20/21 |
| Vehicul | `id-v1:7:vehicle30:report:company:evolution:fleet4:TAXI4:0021` slot 21 (compact) |
| Simulat live | null |
| Nivel înainte/după | 1/2 |

## Upgrade cu efect în perioada următoare

`upgrade-service-contract` costă 8000 SDA și aplică
5000/10000 din costul `SERVICE` de la tick-ul
2160000 (m0001). Costul serviciului:
40 SDA în perioada curentă, apoi
20 SDA din baza de
40 SDA. Intrarea istorică rămâne neschimbată:
true. Efectul este vizibil: true.

## Refuzuri închise

- Cash insuficient: `INSUFFICIENT_CASH`, cash 10000, cost 12000, schimbare false.
- Nivel insuficient: `LEVEL_REQUIRED`, nivel 1 < 2, schimbare false.
- Duplicate: achiziție `ALREADY_OWNED`, upgrade `ALREADY_OWNED`.

## Cash și flotă

- Cash inițial: 50000 SDA
- Revenue: 14000 SDA
- Profit: 6110 SDA
- Cash înainte de investiții: 56110 SDA
- Investiții: 20000 SDA (vehicule 12000, upgrade-uri 8000)
- Cash: 36110 SDA (initialCash + profit - investments, clamped at zero)
- Pierdere neacoperită: 0 SDA
- Flotă: 21 taxiuri + 20 civili = 41; capacitate taxi 30, rămasă 9; valoare 12000 SDA.
- Același registry, fără o a doua flotă: true.

## Reload și import

Snapshot: 1 achiziții, 1 upgrade-uri.
Restore: 1/1; nivel 2→2; cash 35655→35655; slot 21→21. Un ledger ne-restaurat este refuzat: true. Persistarea fișierului după reload rămâne 278.

## Separarea de XP și stil

- XP: sold 0/0, nivel 1/1, intrări 0/0; identic true.
- Stil: `profile:269:report`/`profile:269:report:v1`, checksum `262-live-fleet-v1:profile:269:report:profile:269:report:v1`, identic true.
- Contoare: XP 0, profil 0, override stil 0, 209 0, investiții 2, historyScans 0.
- Suprafață purchase/upgrade: true/true; a doua flotă: false.

## Verificări

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
| contract | "269-company-evolution-v1" | "269-company-evolution-v1" | PASS | the evolution contract |
| ledger-contract | "268-company-ledger-v1" | "268-company-ledger-v1" | PASS | the same 268 ledger |
| level-table | "269-company-levels-v1" | "269-company-levels-v1" | PASS | the versioned level table |
| level-monotonic | true | true | PASS | strictly increasing thresholds |
| level-1-zero | 1 | 1 | PASS | level 1 at zero reinvested profit |
| level-2-5000 | 2 | 2 | PASS | level 2 at 5 000 SDA |
| level-3-15000 | 3 | 3 | PASS | level 3 at 15 000 SDA |
| level-not-xp | false | false | PASS | XP is never an input |
| initial-level | 1 | 1 | PASS | a new company is level 1 |
| profit-not-reinvested | 1 | 1 | PASS | 12 rides of profit alone do not raise the level before an investment |
| catalog-offers | 6 | 6 | PASS | six one-time vehicle offers |
| catalog-upgrades | 5 | 5 | PASS | five versioned upgrades |
| effects-bounded | true | true | PASS | no upgrade raises a cost or discounts more than 50% |
| purchase-accepted | "ACCEPTED" | "ACCEPTED" | PASS | bought offer-city-compact-1 |
| purchase-cost | 12000 | 12000 | PASS | declared cost |
| purchase-cash | 43220 | 43220 | PASS | cash is reduced by exactly the cost |
| purchase-fleet | 21 | 21 | PASS | the same registry grows by one taxi |
| purchase-slot | 21 | 21 | PASS | the next real 057 slot is respected |
| purchase-class | "compact" | "compact" | PASS | the offer class is real |
| purchase-vehicle-real | true | true | PASS | the returned vehicle exists in the live registry |
| purchase-level | 2 | 2 | PASS | reinvested profit raises level |
| purchase-investment | 12000 | 12000 | PASS | the purchase is one investment entry |
| purchase-live-simulated | null | null | PASS | the report registry port has no actor probe; the 058 growth test and browser probe prove the actor |
| insufficient-cash | "INSUFFICIENT_CASH" | "INSUFFICIENT_CASH" | PASS | a purchase beyond cash is refused |
| insufficient-unchanged | true | true | PASS | cash, fleet and investment journal |
| level-required | "LEVEL_REQUIRED" | "LEVEL_REQUIRED" | PASS | level 1 is below 2 |
| level-required-unchanged | true | true | PASS | no fleet or cash change |
| duplicate-purchase | "ALREADY_OWNED" | "ALREADY_OWNED" | PASS | the same offer cannot be bought twice |
| duplicate-upgrade | "ALREADY_OWNED" | "ALREADY_OWNED" | PASS | the same upgrade cannot be bought twice |
| duplicates-stable | 2 | 2 | PASS | duplicates do not add investment entries |
| upgrade-accepted | "ACCEPTED" | "ACCEPTED" | PASS | bought upgrade-service-contract |
| upgrade-cost | 8000 | 8000 | PASS | declared cost |
| upgrade-basis-points | 5000 | 5000 | PASS | the declared bounded effect |
| upgrade-next-period | 2160000 | 2160000 | PASS | the effect starts at the next simulated month |
| upgrade-period | "m0001" | "m0001" | PASS | next period identity |
| service-before | 40 | 40 | PASS | the current period keeps the base price |
| service-after | 20 | 20 | PASS | the next period applies the declared effect |
| service-base | 40 | 40 | PASS | the base amount stays visible |
| service-basis-points | 5000 | 5000 | PASS | the applied basis points are recorded |
| history-unchanged | true | true | PASS | the earlier ride entry is never rewritten |
| pending-before | true | true | PASS | the next-period effect is visible before it applies |
| effective-after | true | true | PASS | the effect is visible in the next period read model |
| cash-before-investment | 56110 | 56110 | PASS | operating cash uses the unchanged 268 formula |
| cash-formula | 36110 | 36110 | PASS | cash = initial + profit - investments, clamped at zero |
| investment-split | 20000 | 20000 | PASS | vehicle and upgrade investment are separate |
| fleet-value | 12000 | 12000 | PASS | fleet value is the real purchase value |
| same-registry | true | true | PASS | the evolution uses the one live 057 registry |
| reload-purchases | 1 | 1 | PASS | the purchase journal is restored |
| reload-upgrades | 1 | 1 | PASS | the upgrade journal is restored |
| reload-state | true | true | PASS | level, cash and next-period effect survive restore |
| reload-slot | 21 | 21 | PASS | the real fleet slot is restored |
| reload-guard | true | true | PASS | a ledger restored without its 268 state is refused |
| xp-balance | 0 | 0 | PASS | XP is untouched |
| xp-level | 1 | 1 | PASS | the player level is untouched |
| xp-entries | 0 | 0 | PASS | the XP ledger is untouched |
| style-identity | true | true | PASS | the style is untouched |
| boundary-xp | 0 | 0 | PASS | no XP write surface |
| boundary-profile | 0 | 0 | PASS | no profile write surface |
| boundary-style | 0 | 0 | PASS | no hidden driving-style override |
| boundary-economy | 0 | 0 | PASS | no 209 write surface |
| boundary-investment | 2 | 2 | PASS | both outflows are in the same ledger |
| boundary-history | 0 | 0 | PASS | reads use incremental totals |
| purchase-surface | true | true | PASS | 269 adds the purchase command |
| upgrade-surface | true | true | PASS | 269 adds the upgrade command |
| no-second-fleet | false | false | PASS | no second fleet is created |
| live-contract | "269-live-company-evolution-v1" | "269-live-company-evolution-v1" | PASS | the live evolution port is exposed |

## Rezumat

66/66 verificări au trecut; overall PASS.
