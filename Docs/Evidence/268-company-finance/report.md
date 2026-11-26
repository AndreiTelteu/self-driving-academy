# 268 — modelul financiar al companiei

Raport determinist generat de `npm run company:finance`.

Contract `268-company-ledger-v1` / `268-live-company-finance-v1`; schedule `268-company-cost-model-v1`.
Valorile de cost sunt propuneri de calibrare, nu rezultate economice reale.

## Scenarii

| Scenariu | Revenue | Cost | Profit | Detaliu |
| --- | ---: | ---: | ---: | --- |
| Cursă profitabilă `id-v1:4:ride14:test:265:rides51:id-v1:12:ride-request14:test:265:rides4:w0005:r0000` | 551 | 148 | 403 | 1027 m, energie 62, mentenanță 46, serviciu 40 |
| Cursă în pierdere `id-v1:4:ride14:test:265:rides51:id-v1:12:ride-request14:test:265:rides4:w0005:r0000` | 551 | 2648 | -2097 | incident 2500, impacturi 1 |
| Anulare `id-v1:4:ride14:test:265:rides51:id-v1:12:ride-request14:test:265:rides4:w0005:r0000` | 0 | 40 → 0 | 0 | ajustare -40, cauză `SERVICE_NOT_DELIVERED` |
| Lună fără curse | 0 | 4000 | -4000 | 0 curse, cost fix 4000, PARTIAL |

## Costuri fixe lunare

Asigurări 1200, salarii 2400, licențe 400; total 4000 SDA pe lună simulată.
Aplicarea este idempotentă: 3 intrări noi, 0 duplicate la a doua aplicare.

## Cash și profit

- Revenue: 551 SDA
- Cost brut: 4148 SDA
- Ajustări: 0 SDA
- Cost net: 4148 SDA
- Profit: -3597 SDA
- Cash: 46403 SDA (initialCash + profit, clamped at zero)
- Pierdere neacoperită: 0 SDA

## Separarea de 209 și XP

- KPI înainte/după: revenue 551/551, settle-uri 1/1, review-uri 1/1, historyScans 0/0.
- XP înainte/după: sold 0/0, nivel 1/1, intrări 0/0.
- Scrieri structurale: XP 0, 209 0, investiții 0; suprafață purchase/upgrade false/false.

## Verificări

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
| contract | "268-company-ledger-v1" | "268-company-ledger-v1" | PASS | the company ledger version |
| live-contract | "268-live-company-finance-v1" | "268-live-company-finance-v1" | PASS | the live company port version |
| schedule-version | "268-company-cost-model-v1" | "268-company-cost-model-v1" | PASS | the versioned cost schedule |
| profitable-terminal | "COMPLETED" | "COMPLETED" | PASS | the real 061 ride completed |
| profitable-passenger | true | true | PASS | a completed ride carried the passenger |
| profitable-revenue | 551 | 551 | PASS | revenue is copied from the 209 settlement |
| profitable-distance | true | true | PASS | 1027 planned metres |
| profitable-energy | true | true | PASS | 62 SDA energy |
| profitable-maintenance | true | true | PASS | 46 SDA maintenance |
| profitable-service | 40 | 40 | PASS | the per-ride service cost |
| profitable-incident | 0 | 0 | PASS | no incident on the clean ride |
| profitable-gross-profit | true | true | PASS | 403 SDA before fixed costs |
| one-cost-entry | 1 | 1 | PASS | one cost entry for the terminal ride |
| profit-formula | -3597 | -3597 | PASS | profit = revenue - net cost |
| cash-formula | 46403 | 46403 | PASS | cash is initial cash plus profit, clamped at zero |
| month-with-rides | true | true | PASS | 1 terminal ride(s) |
| month-fixed-costs | 4000 | 4000 | PASS | the month carries the fixed monthly cost |
| empty-month-present | true | true | PASS | a month with fixed costs is materialised |
| empty-month-no-rides | 0 | 0 | PASS | zero terminal rides |
| empty-month-fixed-costs | 4000 | 4000 | PASS | fixed costs are real |
| empty-month-negative-profit | true | true | PASS | -4000 SDA real loss |
| empty-month-not-missing | false | false | PASS | no ride data, but the month is not NO_DATA |
| empty-month-partial | "PARTIAL" | "PARTIAL" | PASS | the current simulated month is partial |
| fixed-costs-idempotent | 0 | 0 | PASS | 3 duplicate fixed entries |
| fixed-cost-count | 3 | 3 | PASS | insurance, salaries and licences |
| loss-incident-cost | 2500 | 2500 | PASS | a real 028 impact adds the versioned incident cost |
| loss-real-review | 1 | 1 | PASS | the review carries the real impact count |
| loss-ride-negative | true | true | PASS | -2097 SDA ride loss |
| cancellation-adjustment | "SERVICE_NOT_DELIVERED" | "SERVICE_NOT_DELIVERED" | PASS | a cancellation is an adjustment |
| cancellation-adjustment-amount | -40 | -40 | PASS | the service cost is refunded explicitly |
| cancellation-entry-immutable | 40 | 40 | PASS | the original cost entry is not rewritten |
| cancellation-net-cost | 0 | 0 | PASS | the ride cost nets to zero after the adjustment |
| cancellation-no-revenue | 0 | 0 | PASS | a pre-boarding cancellation keeps no fare |
| duplicate-no-entry | 0 | 0 | PASS | a re-delivered terminal result is not costed twice |
| duplicate-counted | 1 | 1 | PASS | the duplicate is reported explicitly |
| duplicate-stable | 551 | 551 | PASS | revenue is unchanged by the duplicate |
| duplicate-entries-stable | 1 | 1 | PASS | the cost entry count is unchanged |
| kpi-revenue | 551 | 551 | PASS | the 209 revenue is unchanged by the company read |
| kpi-settlements | 1 | 1 | PASS | the 209 settlements are unchanged |
| kpi-reviews | 1 | 1 | PASS | the 209 reviews are unchanged |
| kpi-history-scans | 0 | 0 | PASS | the 209 read model still never scans history |
| xp-balance | 0 | 0 | PASS | negative profit never withdraws XP |
| xp-level | 1 | 1 | PASS | the player level is unchanged |
| xp-entries | 0 | 0 | PASS | the XP ledger is untouched |
| boundary-xp | 0 | 0 | PASS | no XP write surface |
| boundary-economy | 0 | 0 | PASS | no 209 write surface |
| boundary-investment | 0 | 0 | PASS | no purchase or upgrade surface |
| boundary-history | 0 | 0 | PASS | company reads use incremental totals |
| no-purchase | false | false | PASS | PBI 269 owns purchases |
| no-upgrade | false | false | PASS | PBI 269 owns upgrades |

## Rezumat

50/50 verificări au trecut; overall PASS.
