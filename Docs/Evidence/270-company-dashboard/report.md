# 270 — raport determinist panoul companiei

Generat de `npm run company:dashboard` peste ledgerul real 268 și evoluția reală 269, cu panoul
real montat pe DOM-ul determinist. Nu măsoară timp de perete, FPS sau GPU.

| Metric | Value |
| --- | ---: |
| Company level | 1 / 6 |
| Revenue / cost / profit | 16000 / 10900 / 5100 SDA |
| Cash / fleet value | 55100 / 0 SDA |
| Months (data / missing) | 2 / 1 |
| Missing month | Luna simulată 1 = fără date |
| Real zero month | Luna simulată 2 = 0 SDA |
| Negative profit month | Luna simulată 2 = -4000 SDA |
| historyScans before / after | 0 / 0 |

## Achiziție și upgrade

| Metric | Value |
| --- | ---: |
| Offer / cost | `offer-city-compact-1` / 12000 SDA |
| Cash before / after | 55100 / 43100 SDA |
| Taxis before / after | 20 / 21 |
| Level before / after | 1 / 2 |
| Upgrade / cost | `upgrade-service-contract` / 8000 SDA |
| Effect | SERVICE × 5000 bp from m0003 |
| Service month 0 → next month | 800 → 80 SDA |
| Next month revenue / profit | 5200 / 700 SDA |
| Pending effects before / after | false / 1 |

## Refuzuri

- fonduri insuficiente: `INSUFFICIENT_CASH` blocked=true unchanged=true — Taxi compact 1Cumpără12000 SDA · Adaugă un taxi compact în flota live.Fonduri insuficiente: Fonduri insuficiente: cost 12000 SDA, cash 10000 SDA.
- nivel insuficient: `LEVEL_REQUIRED` — Taxi sedan 1Cumpără22000 SDA · Adaugă un taxi sedan în flota live.Nivel insuficient: Nivel insuficient: cere nivelul 2, compania are nivelul 1.
- upgrade duplicat: blocked=true — Deținut · efect activ

## Cost UI

- elemente / noduri text: 252 / 165
- listeneri / listeneri globali: 2 / 0
- citiri închis: 0; citiri totale: 2
- randări: 4; bare: 12; rânduri de tabel: 11
- oferte / upgrade-uri: 6 / 5
- Escape / Tab wraps / focus / restore: 0 / 0 / 6 / 0

## Verificări

- `projection-revenue`: PASS — actual 16000, expected 16000. panel revenue equals the 268 ledger revenue
- `projection-cost`: PASS — actual 10900, expected 10900. panel costs equal net cost, including signed adjustments
- `projection-profit`: PASS — actual 5100, expected 5100. panel profit equals the 268 profit
- `projection-cash`: PASS — actual 55100, expected 55100. panel cash equals the 269 cash formula
- `projection-fleet-value`: PASS — actual 0, expected 0. panel fleet value is the acquisition value of purchased vehicles
- `projection-level`: PASS — actual 1, expected 1. panel level is the company level, not XP
- `missing-month`: PASS — actual NO_DATA, expected NO_DATA. a month without a bucket is not zero
- `missing-month-labels`: PASS — actual fără date/fără date, expected fără date/fără date. a missing month prints fără date, never 0 SDA
- `zero-revenue`: PASS — actual 0 SDA, expected 0 SDA. a real zero revenue stays zero
- `negative-profit`: PASS — actual -4000 SDA, expected -4000 SDA. a real negative profit is visible and marked
- `chart-table-aggregates`: PASS — actual true, expected true. chart bars and monthly table rows use the same aggregates
- `closed-update`: PASS — actual SKIPPED_CLOSED, expected SKIPPED_CLOSED. closed panel update does not read
- `closed-refresh`: PASS — actual SKIPPED_CLOSED, expected SKIPPED_CLOSED. closed panel explicit refresh does not read
- `closed-reads`: PASS — actual 1, expected 1. opening the panel reads exactly once
- `purchase-card`: PASS — actual true, expected true. available offer has an enabled button
- `purchase-confirmation`: PASS — actual true, expected true. purchase asks for confirmation with cost and effect
- `purchase-accepted`: PASS — actual OWNED/43100, expected OWNED/43100. purchase spends real cash in the same ledger
- `purchase-fleet`: PASS — actual 20->21, expected 20->21. purchase adds the real 057 taxi
- `purchase-level`: PASS — actual 1->2, expected 1->2. reinvested purchase profit raises the company level
- `upgrade-card`: PASS — actual true, expected true. level 2 makes the service upgrade available
- `upgrade-pending-before`: PASS — actual false, expected false. no pending service effect before buying
- `upgrade-owned`: PASS — actual OWNED, expected OWNED. upgrade ownership is rendered
- `upgrade-pending-after`: PASS — actual 1, expected 1. the next-period effect is listed once
- `upgrade-next-service`: PASS — actual 80, expected 80. four rides at 40 SDA become four at 20 SDA in the next month
- `upgrade-next-profit`: PASS — actual 5200/700, expected 5200/700. next-month profit reflects the halved service cost (5200 - 4500)
- `insufficient-cash`: PASS — actual INSUFFICIENT_CASH/true/true, expected INSUFFICIENT_CASH/true/true. insufficient funds block the purchase and change nothing
- `insufficient-cash-message`: PASS — actual Taxi compact 1Cumpără12000 SDA · Adaugă un taxi compact în flota live.Fonduri insuficiente: Fonduri insuficiente: cost 12000 SDA, cash 10000 SDA., expected contains Fonduri insuficiente and cash 10000 SDA. the refusal names the missing cash explicitly
- `level-required`: PASS — actual LEVEL_REQUIRED, expected LEVEL_REQUIRED. a level-locked offer is blocked with the required level text
- `duplicate-upgrade`: PASS — actual Deținut · efect activ, expected Deținut. an owned upgrade is refused explicitly
- `no-history-scans`: PASS — actual 0, expected 0. company read model keeps historyScans 0
- `listeners`: PASS — actual 2, expected 2. only the dialog keydown and click listeners
- `global-listeners`: PASS — actual 0, expected 0. no window/document listener
- `determinism`: PASS — actual true, expected true. two projections of the same read are identical

**Rezultat:** 33/33 verificări, PASS.
