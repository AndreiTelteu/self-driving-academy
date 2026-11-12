# 233 challenge experience report

Transcript mașină-citibil: [report.json](report.json). Generat de `npm run missions:challenge-experience`; niciun ceas de perete, generator aleator sau browser nu participă. Versiune: `233-challenge-experience-report-v1`.

## Contract

- Experiență: `233-challenge-experience-v1`; stare: `233-challenge-experience-state-v1`.
- Record: `233-challenge-record-v1`; reacție: `233-challenge-reaction-v1`.
- Panou: `233-challenge-panel-v1`.
- Identitate recompensă: `id-v1:16:challenge-reward27:233-challenge-experience-v19:PRECISION10:2026-11-12`.
- Capacități: 32 rânduri de record, 64 chei de recompensă, 3 provocări zilnice, 240 unități per replică, 0 listeners globali.

## Credit XP

| Scenariu | Status | Motiv | Familie | Data | Calendar | XP autorat | XP creditat | Sold | Intrări | Cont |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| academy_first_completion | CREDITED | — | PRECISION | 2026-11-12 | NEW_DAY | 80 | 80 | 80 | 1 | one authored credit through the real 213 ledger |
| academy_same_family_same_day | DUPLICATE | FAMILY_REWARDED_TODAY | PRECISION | 2026-11-12 | SAME_DAY | 80 | 0 | 80 | 1 | the family/day identity is already credited |
| calendar_rollback | SKIPPED | CALENDAR_ROLLBACK | PRECISION | 2026-11-11 | ROLLBACK | 80 | 0 | 80 | 1 | a past date opens no new credit |
| declined_offer | SKIPPED | NOT_COMPLETED | EXPERIMENT | 2026-11-12 | SAME_DAY | 0 | 0 | 80 | 1 | a refusal costs no XP |
| deadline_failure | SKIPPED | NOT_COMPLETED | EFFICIENCY | 2026-11-12 | SAME_DAY | 0 | 0 | 80 | 1 | a failure costs no XP |
| haos_completion | SKIPPED | LOCAL_RECORD_ONLY | PRECISION | 2026-11-12 | NEW_DAY | 0 | 0 | 0 | 0 | Haos keeps a local record only |
| academy_same_family_next_day | CREDITED | — | PRECISION | 2026-11-13 | NEW_DAY | 80 | 80 | 160 | 2 | a new local date pays the family credit again |

## Recorduri personale

| Scenariu | Comparație | Timp încercare | Cel mai bun | Îmbunătățit | Rang |
| --- | --- | --- | --- | --- | --- |
| first_record | FIRST_RECORD | 300 | 300 | true | 1, -300, 0 |
| slower_run | WORSE | 900 | 300 | false | 1, -300, 0 |
| equal_run | EQUAL | 300 | 300 | false | 1, -300, 0 |
| faster_run | BETTER | 120 | 120 | true | 1, -120, 0 |

## Reluare rapidă

| Status | Cod | Încercare | Același șablon | Identitate nouă | XP |
| --- | --- | --- | --- | --- | --- |
| RESTARTED | — | 2 | true | true | 0 |
| REFUSED | NOT_FAILED | 2 | true | false | 0 |

- XP după reluare: 80; a doua reușită a familiei în aceeași zi: `FAMILY_REWARDED_TODAY`.

## Varietate zilnică

| Data | Șabloane | Familii | MANUAL | Exact trei | Unice | Fără Haos | Fără repetare |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | challenge-city-copies-me, challenge-forgot-something, challenge-influencer-no-spill | 3 | 2 | true | true | true | true |
| 2026-11-10 | challenge-city-tour-backwards, challenge-valet-with-style, challenge-maternity-run | 3 | 3 | true | true | true | true |
| 2026-11-11 | challenge-influencer-parking-drift, challenge-last-minute-airport, challenge-influencer-no-spill | 3 | 3 | true | true | true | true |
| 2026-11-12 | challenge-influencer-single-frame, challenge-city-copies-me, challenge-maternity-run | 3 | 2 | true | true | true | true |
| 2026-11-13 | challenge-last-minute-airport, challenge-toilet-sos, challenge-influencer-parking-drift | 3 | 3 | true | true | true | true |

- Punte 211: `231-challenge-daily-bridge-v1`; 3 familii expresabile, 9 șabloane cu evaluator propriu 231 rămân deschise.

## Reacții comice

| Trigger | Ton | Efect | XP | Autorată | Text |
| --- | --- | --- | --- | --- | --- |
| OFFER | NEUTRAL | NONE | XP_PENDING | true | Parchează precis. Un valet cu stil nu lasă mașina strâmbă. |
| PROGRESS | NEUTRAL | NONE | XP_PENDING | true | Aproape de loc. Încet, cu orientarea cerută. |
| SUCCESS | CELEBRATION | CELEBRATION | XP_PENDING | true | Parcare perfectă: viteză mică, orientare exactă. |
| SUCCESS | CELEBRATION | CELEBRATION | XP_CREDITED | true | Parcare perfectă: viteză mică, orientare exactă. |
| SUCCESS | CELEBRATION | CELEBRATION | RECORD_ONLY | true | Parcare perfectă: viteză mică, orientare exactă. |
| DECLINE | SHRUG | SHRUG | NO_XP_LOSS | false | Clientul s-a răzgândit: „Las-o pentru data viitoare.” Niciun XP nu se pierde. |
| FAILURE | COMMISERATION | COMMISERATION | NO_XP_LOSS | true | Am pierdut zborul. Reluăm cu altă rută. |

## Stocare și performanță

- Snapshot: 1116 bytes, 1 recorduri, 1 chei; intrări 213: 1 (786 bytes).
- `challengeHistoryEntries` este `NULL_IN_MANIFEST`; PBI-ul stabilește capacitatea finită `PROVISIONAL_FINITE` și raportează lacuna de calibrare.
- UI: panoul `233-challenge-panel-v1` are 0 listeners globali, o citire per deschidere și nu intră în bucla 3D. Bugetul de frame p95 18.5 ms provine din `Docs/performance-budgets.json`; măsurarea este `NOT_MEASURED_DEV` (PBI targeted, fără lucru pe tick).
- Simulare: 7 cereri de credit, 2 credite și 0 duplicate în ledgerul real; lucru per tick: `NONE`.
- Stocare: `233-challenge-experience-state-v1`, 32 rânduri, 64 chei; the oldest reward key is dropped with a counter; the real 213 ledger still deduplicates it.

## Checks

| Check | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
| experience-version | 233-challenge-experience-v1 | 233-challenge-experience-v1 | PASS | versioned contract |
| state-version | 233-challenge-experience-state-v1 | 233-challenge-experience-state-v1 | PASS | versioned snapshot |
| record-version | 233-challenge-record-v1 | 233-challenge-record-v1 | PASS | versioned record rows |
| reaction-version | 233-challenge-reaction-v1 | 233-challenge-reaction-v1 | PASS | versioned reactions |
| panel-version | 233-challenge-panel-v1 | 233-challenge-panel-v1 | PASS | read-only UI projection |
| records-cap | 32 | 32 | PASS | finite record rows |
| rewarded-keys-cap | 64 | 64 | PASS | finite calendar keys |
| daily-picks | 3 | 3 | PASS | exactly three daily challenges |
| credit-first | CREDITED | CREDITED | PASS | the first Academy completion pays its authored XP |
| credit-first-xp | true | true | PASS | the credited amount is the real authored XP |
| credit-duplicate | DUPLICATE | DUPLICATE | PASS | the same family and day never pays twice |
| credit-duplicate-zero | 0 | 0 | PASS | a duplicate pays nothing |
| credit-rollback | CALENDAR_ROLLBACK | CALENDAR_ROLLBACK | PASS | a past date opens no credit |
| credit-decline | NOT_COMPLETED | NOT_COMPLETED | PASS | a refusal pays nothing |
| credit-failure | NOT_COMPLETED | NOT_COMPLETED | PASS | a failure pays nothing |
| credit-haos | LOCAL_RECORD_ONLY | LOCAL_RECORD_ONLY | PASS | Haos keeps a local record only |
| credit-next-day | CREDITED | CREDITED | PASS | a new day pays the family credit again |
| credit-ledger-entries | 2 | 2 | PASS | two real 213 entries for two real credits |
| record-first | FIRST_RECORD | FIRST_RECORD | PASS | first pass is a record |
| record-worse | WORSE | WORSE | PASS | a slower pass is worse |
| record-equal | EQUAL | EQUAL | PASS | an equal pass is equal |
| record-better | BETTER | BETTER | PASS | a faster pass is better |
| record-never-lowers | 300,300,300,120 | 300,300,300,120 | PASS | a worse or equal run never rewrites the best; only a faster run does |
| record-improved-flags | true,false,false,true | true,false,false,true | PASS | only a first or a strictly better run rewrites the best |
| retry-status | RESTARTED | RESTARTED | PASS | a failed challenge restarts immediately |
| retry-new-identity | true | true | PASS | the retry has a new instance identity |
| retry-same-template | true | true | PASS | the template identity is unchanged |
| retry-attempt | 2 | 2 | PASS | the retry is a new attempt |
| retry-no-xp | 0 | 0 | PASS | a retry never changes the balance |
| retry-credit-once | true | true | PASS | the first completion after the retry pays once |
| retry-duplicate | FAMILY_REWARDED_TODAY | FAMILY_REWARDED_TODAY | PASS | a further same-family run that day is a duplicate |
| retry-refuses-completed | NOT_FAILED | NOT_FAILED | PASS | a completed challenge is not retried |
| daily-exactly-three | true | true | PASS | five days of exactly three |
| daily-unique | true | true | PASS | no template repeats in a day |
| daily-manual | true | true | PASS | at least one MANUAL per day |
| daily-families | true | true | PASS | varied families |
| daily-no-chaos | true | true | PASS | no Haos-only objective |
| daily-no-repeat | true | true | PASS | a previous day is not repeated when alternatives exist |
| daily-bridge | 231-challenge-daily-bridge-v1 | 231-challenge-daily-bridge-v1 | PASS | the 211 bridge stays authoritative |
| daily-expressible | 3 | 3 | PASS | three template families map to 211 |
| daily-deferred | 9 | 9 | PASS | nine objectives keep their own 231 evaluator |
| reaction-offer | OFFER | OFFER | PASS | the offer shows the authored premise |
| reaction-progress | PROGRESS | PROGRESS | PASS | the live attempt shows the authored progress line |
| reaction-success | SUCCESS | SUCCESS | PASS | a completion shows the authored success line |
| reaction-credited | XP_CREDITED | XP_CREDITED | PASS | a credit states the single XP credit |
| reaction-record-only | RECORD_ONLY | RECORD_ONLY | PASS | a duplicate states record only |
| reaction-decline | DECLINE | DECLINE | PASS | a refusal has a closed safe line |
| reaction-failure | FAILURE | FAILURE | PASS | a failure shows the authored failure line |
| reaction-xp-safe | true | true | PASS | every reaction carries xpDelta 0 |
| storage-records | 1 | 1 | PASS | the snapshot keeps the record |
| storage-keys | 1 | 1 | PASS | the snapshot keeps the family/day denial key |
| storage-highest-date | 2026-11-12 | 2026-11-12 | PASS | the calendar never lowers the highest observed date |
| storage-snapshot-bounded | true | true | PASS | bounded snapshot bytes |
| ledger-balance | 1 | 1 | PASS | the ledger is the single XP truth |
| record-template | challenge-valet-with-style | challenge-valet-with-style | PASS | the record belongs to the offered template |

## Sumar

- Checks: 55/55
- Overall: PASS
