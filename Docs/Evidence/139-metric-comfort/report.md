# Raport 139 — indicatori de confort cu pasager

Contract: `139-comfort-metrics-v1` · evenimente: PASSENGER_INTERVAL, PASSENGER_IMPACT
Praguri: accelerație ≤ 2 m/s², jerk ≤ 2 m/s³ (comfort_deceleration / acceleration_jerk).

## Scenarii

| Scenariu | Ride | Moduri | Intervale | Accel. max | Lateral max | Jerk max | Viol. accel | Viol. jerk | Viol. lateral | Scor confort | Impacte |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cursă linie · AUTO | ride:139:linear | AUTO | 120 | 0.9375 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| cursă bruscă · MANUAL | ride:139:brisk | MANUAL | 120 | 5.625 | 0 | 0 | 120 | 0 | 0 | 3 | 0 |
| cursă jerky · LEARNING | ride:139:jerky | LEARNING | 120 | 1.875 | 0 | 225 | 0 | 119 | 0 | 3 | 0 |
| cursă mixtă · AUTO+MANUAL+LEARNING | ride:139:mixed | AUTO/LEARNING/MANUAL | 179 | 0.9375 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| cursă cu incident | ride:139:incident | AUTO | 59 | 0.9375 | 0 | 0 | 0 | 0 | 0 | 5 | 1 |
| taxi nevizibil | ride:139:invisible | AUTO | 120 | 0.9375 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| recuperare 030 · teleport exclus | ride:139:recovery | MANUAL | 59 | 0.9375 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| curbă · accelerație laterală | ride:139:turn | AUTO | 120 | 0.000052 | 3.333362 | 0.006063 | 0 | 0 | 0 | 5 | 0 |

## Cost local (provizoriu, măsurat pe această mașină)

- Intervale ingerate: 12000
- Cost ingest: 31.542 ms (0.002629 ms/interval)
- Mod AUTO: 12.891 ms (0.003223 ms/interval)
- Mod MANUAL: 9.155 ms (0.002289 ms/interval)
- Mod LEARNING: 9.496 ms (0.002374 ms/interval)
- Taxi nevizibil: 7.468 ms pentru 4000 intervale (0.001867 ms/interval)
- Snapshoturi: 2000 în 14.998 ms (0.007499 ms/snapshot)
- măsurătoare locală, provizorie: nu este buget, FPS sau dovadă hardware

## Verificări

- PASS **contract-version** — 139 comfort metrics contract version
- PASS **closed-event-kinds** — the service ingests exactly the passenger interval and the passenger impact
- PASS **control-modes** — AUTO, MANUAL and LEARNING are all aggregated
- PASS **threshold-acceleration** — the comfort acceleration threshold is the catalog default of comfort_deceleration
- PASS **threshold-jerk** — the comfort jerk threshold is the catalog default of acceleration_jerk
- PASS **threshold-source** — the threshold provenance is the shipped parameter catalog
- PASS **review-model-version** — the review model reads the comfort read model
- PASS **linear-intervals** — the linear ride contributes one interval per tick pair
- PASS **linear-peak-acceleration** — the linear ride peaks at the recorded 0,9375 m/s²
- PASS **linear-violations** — the linear ride exceeds no comfort threshold
- PASS **linear-mode** — the linear ride is aggregated in its own control mode
- PASS **brisk-peak-acceleration** — the brisk ride peaks at the recorded 5,625 m/s²
- PASS **brisk-violations** — every interval of the brisk ride exceeds the acceleration threshold
- PASS **brisk-jerk-violations** — a constant acceleration has no jerk violation
- PASS **jerky-peak-jerk** — the jerky ride peaks at the real 225 m/s³ jerk
- PASS **jerky-acceleration-violations** — the jerky ride stays inside the acceleration threshold
- PASS **jerky-jerk-violations** — every jerk pair of the jerky ride exceeds the jerk threshold
- PASS **mixed-modes** — the mixed ride is aggregated in all three control modes
- PASS **mixed-intervals** — the mixed ride contributes every usable interval of its three segments
- PASS **mixed-mode-counts** — the AUTO part of the mixed ride keeps its own intervals
- PASS **incident-excluded-samples** — the 088 window suppresses every sample from the impact tick on
- PASS **incident-intervals** — only the prefix before the real impact reaches the comfort metric
- PASS **incident-impacts** — the real impact is counted as a passenger consequence
- PASS **incident-no-comfort-violation** — the impact impulse never becomes a comfort violation
- PASS **invisible-intervals** — the taxi outside the camera is aggregated like a visible one
- PASS **invisible-total-intervals** — the visible and the off-camera taxi contribute the same intervals
- PASS **recovery-excluded-samples** — the 088 window suppresses the recovery tick and everything after it
- PASS **recovery-peak-acceleration** — the teleport never becomes comfort of the command
- PASS **recovery-violations** — the recovery ride exceeds no comfort threshold
- PASS **turn-lateral** — the turn measures the real lateral acceleration of the recorded velocity
- PASS **turn-lateral-violations** — the comfortable turn stays below the real sedan capability
- PASS **adapter-id** — the 082 adapter exposes the comfort metric
- PASS **adapter-value** — the dashboard reads the comfort score of the shared review model
- PASS **history-scans** — the snapshot performs no history scan
- PASS **limits-retained-keys** — the idempotency memory is bounded
- PASS **limits-retained-rides** — the per-ride read model is bounded

Rezultat: 36/36 verificări, PASS.
