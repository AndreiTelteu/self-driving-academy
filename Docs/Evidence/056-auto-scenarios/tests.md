# Tests 056

Suita are cinci teste Node în `tests/autonomy/auto-scenarios.test.ts`:

| Test | Ce verifică | Timp observat |
| --- | --- | ---: |
| `056 scenario suite covers every named autonomy behaviour with real outcomes` | cele 12 scenarii, comportamentele cerute, cel puțin 3 verificări/scenariu | 588,8 ms |
| `056 negative cases fail closed instead of fabricating a policy answer` | cele 10 guard-uri, motivele exacte și absența țintelor/faptelor inventate | 392,5 ms |
| `056 mutation probes prove plausible wrong implementations would fail` | cele 5 mutații plauzibile sunt respinse de oracle | 342,0 ms |
| `056 suite and machine-readable report are deterministic and serializable` | două rulări identice, JSON fără `undefined`/`NaN`/`Infinity` | 644,1 ms |
| `056 committed evidence report is the current suite transcript` | `report.json` comis este exact raportul curent | 309,0 ms |

Total suita: 2.560,0 ms în rularea țintită, 5/5 PASS.

## Scenarii și verificări

| Scenariu | Verificări |
| --- | ---: |
| `cruise-urban-free-road` | 9 |
| `cruise-residential-curve` | 9 |
| `cruise-intersection-approach` | 9 |
| `signal-red-green` | 33 |
| `stop-rule-profiles` | 7 |
| `route-junction-cautious` | 7 |
| `route-junction-risky` | 6 |
| `follow-leader` | 10 |
| `yield-conflict` | 8 |
| `lane-change` | 29 |
| `blocked-recovery` | 11 |
| `accelerate-native` | 8 |

Cazurile negative sunt listate în [report.md](report.md) și în `negativeCases` din [report.json](report.json). Probele de mutație sunt în `mutationProbes`.
