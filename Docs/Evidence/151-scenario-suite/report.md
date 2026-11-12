# 151 — suita completă de scenarii V1

Transcript determinist generat de `scripts/run-scenario-suite-report.mjs` cu `npm run scenarios:v1`.
Machine-readable: [report.json](report.json).

Regula oracolului: Fiecare rezultat așteptat este contractul livrat (oracolul 050, formula 101, tabelul 061 și identitatea 125), nu o copie a valorii observate. Seed fix 151, zero ceas de perete, zero aleator în transcript.

Seed fix: 151. Două rulări independente produc același transcript;
amprenta SHA-256 a scenariilor este `602a17e79db6d8ce70ebf75541df35b0f56778226ae7adbcd384f81a01789838`.

## Familii

| Familie | Scenarii | Pozitive | Negative | NOT_RUN | Trecute/executate |
| --- | ---: | ---: | ---: | ---: | ---: |
| AUTONOMY | 4 | 3 | 1 | 1 | 3/3 |
| RIDES | 3 | 2 | 1 | 0 | 3/3 |
| LEARNING | 3 | 2 | 1 | 0 | 3/3 |
| CAMPAIGN | 3 | 2 | 1 | 0 | 3/3 |

Total: 13 scenarii, 12 executate,
12 PASS, 0 FAIL, 1 NOT_RUN.

## Scenarii

| ID | Familie | Polaritate | Pași | Verificări | Toleranțe declarate | Verdict |
| --- | --- | --- | ---: | ---: | --- | --- |
| autonomy-green-start-delay | AUTONOMY | POSITIVE | 1 | 6 | EXACT; ABSOLUTE 1e-12 s | PASS |
| autonomy-green-delay-boundary | AUTONOMY | POSITIVE | 1 | 6 | EXACT; ABSOLUTE 1e-12 s | PASS |
| autonomy-stale-observation | AUTONOMY | NEGATIVE | 1 | 6 | EXACT; ABSOLUTE 1e-12 m | PASS |
| rides-full-lifecycle | RIDES | POSITIVE | 5 | 11 | EXACT; ABSOLUTE 0 tranziții; ABSOLUTE 0 tick; ABSOLUTE 0 eliberări; ABSOLUTE 0 curse | PASS |
| rides-duplicate-terminal-event | RIDES | POSITIVE | 6 | 4 | EXACT; ABSOLUTE 0 eliberări; ABSOLUTE 0 curse; ABSOLUTE 0 tranziții | PASS |
| rides-illegal-dropoff-before-pickup | RIDES | NEGATIVE | 2 | 5 | EXACT; ABSOLUTE 0 tranziții; ABSOLUTE 0 eliberări | PASS |
| learning-single-episode-bounded | LEARNING | POSITIVE | 1 | 7 | ABSOLUTE 0.0001 ratio; ABSOLUTE 0.0001 m/s; EXACT | PASS |
| learning-repeated-evidence | LEARNING | POSITIVE | 16 | 8 | ABSOLUTE 0.0001 ratio; ABSOLUTE 0.0001 m/s; EXACT; ABSOLUTE 0.000001 episoade | PASS |
| learning-contradiction-holds-profile | LEARNING | NEGATIVE | 1 | 7 | EXACT; ABSOLUTE 0 m/s | PASS |
| campaign-first-mission | CAMPAIGN | POSITIVE | 1 | 15 | ABSOLUTE 0 misiuni; EXACT; ABSOLUTE 0 recompense; ABSOLUTE 0 XP; ABSOLUTE 0 încercări | PASS |
| campaign-chain-unlocks-next | CAMPAIGN | POSITIVE | 1 | 4 | EXACT; ABSOLUTE 0 misiuni | PASS |
| campaign-duplicate-settlement-refused | CAMPAIGN | NEGATIVE | 2 | 8 | EXACT; ABSOLUTE 0 recompense; ABSOLUTE 0 XP; ABSOLUTE 0 rânduri | PASS |
| integration-browser-playtest | AUTONOMY | POSITIVE | — | — | — | NOT_RUN: Necesită browser real, GPU, input uman și focus fizic. Nivelul suitei este determinist în Node, fără renderer; playtestul rămâne al gate-urilor 153/235 și nu este declarat trecut. |

## Refuzuri explicite (NOT_RUN)

- **integration-browser-playtest**: Necesită browser real, GPU, input uman și focus fizic. Nivelul suitei este determinist în Node, fără renderer; playtestul rămâne al gate-urilor 153/235 și nu este declarat trecut.

## Refolicit din suitele livrate

| Sursă | Rânduri | Dovadă | Verdict |
| --- | --- | --- | --- |
| 216-v1-regression | B5, B6, B7, B8 | Docs/Evidence/216-v1-regression/report.json | PASS |
| 056-auto-scenarios | cruise-urban-free-road, cruise-residential-curve, cruise-intersection-approach, signal-red-green, stop-rule-profiles, route-junction-cautious, route-junction-risky, follow-leader, yield-conflict, lane-change, blocked-recovery, accelerate-native | Docs/Evidence/056-auto-scenarios/report.json | PASS |

- **216-v1-regression**: Daily 211/212 pozitiv și negativ, XP 213 pozitiv și negativ, amprenta XP fără pierderi și graful boardului. Suita 151 nu reexecută aceste verificări.
- **056-auto-scenarios**: Matricea roșu/verde a semaforului, STOP, urmărire, cedare, schimbare de bandă, recuperare blocată și cele 10 refuzuri explicit. Suita 151 adaugă doar green_start_delay și fereastra de observație, care nu sunt acoperite de 056.

## Reproductibilitate

Două rulări independente ale aceleiași funcții produc același JSON; testul compară cele două transcripturi, iar scriptul compară fișierul comis prin --check.

## Limitări

- Nivel determinist în Node: fără browser real, GPU, input uman, FPS sau hardware de referință; playtestul este NOT_RUN.
- Condusul de autonomie este politica 050 evaluată pe observații authorează, nu fizica Babylon/Rapier live.
- Cursa folosește fixture-ul real 057/059/060 din tests/fleet, nu o hartă generată în browser.
- Învățarea este pasul candidat 101; publicarea profilului și joburile worker rămân ale modulelor 109/112, nefiind republicate aici.
- Campania folosește catalogul authorează 116/125; misiunile zilnice 211 și XP 213 sunt refolosite din transcriptul 216, nu reexecutate.
- Suita nu a fost comparată cu un playtest uman și nu pretinde performanță de cadru; gate-urile 153/220/224/235 rămân obligatorii.
