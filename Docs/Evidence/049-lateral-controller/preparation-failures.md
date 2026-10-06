# Preserved preparation failures

Before any native049 run, the first scoped reference test failed with `MapValidationError: map.serviceZones: Array capacity or minimum length violated`. Typecheck passed. The generated independent circle map had no service zones, whereas published032 requires at least one plus per-access reachability.

Adding one service zone per lane preserved a second real failure: `map.serviceZones[0]: TAXI service unreachable from lane lane-1`.032 requires every access-compatible service to be reachable from every admitted lane, rather than merely one reachable service per lane. The final fixture uses separate one-lane validated033 graphs per car, each with an authored service-area/anchor. All cars still share one unchanged native physical world; no service behavior or fabricated inter-circle connection is claimed. No production049 existed and no chronological native capture had been created by either failed reference test.
