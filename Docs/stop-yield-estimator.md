# STOP și acceptarea priorității — estimator 098

`estimateStopYieldParameters` din `src/learning/stop-yield-estimator.ts` consumă read model-urile 093, denominatorul cumulativ 086 și observații corelate cu 087/088. Returnează numai candidați imutabili; nu scrie profiluri, valori, delta și nu activează flaguri.

STOP-ul este eligibil numai când oportunitatea este STOP rezolvată, learning-eligible, iar fereastra este `FREE_TRAFFIC` cu prefix 088 utilizabil. `stopCause: STOP_LINE` distinge decizia la linie. `LEADER`, `QUEUE` și `BLOCKED` rămân în controlul acoperirii 086, dar sunt excluse din denominatorul conformării; un rolling stop explicit intră ca rezultat separat și nu ca oprire completă. `stop_full_probability` folosește doar fapte certe FREE_TRAFFIC/STOP_LINE și verifică acoperirea tuturor faptelor certe 086; zero eligibile produce `REFUSED/ZERO_ELIGIBLE_STOP_DENOMINATOR`, iar fapte lipsă refuză estimarea în loc să fie presupuse eșecuri. `stop_dwell_time` convertește numai `dwellTicks` măsurat la 60 Hz; offset-ul folosește faptele `stopLineOffsetM` măsurate.

`yield_time_gap` ia separarea temporală semnată din faptele relației de prioritate 052. Gap acceptat înseamnă că vehiculul procedează (`PROCEEDED`); `YIELDED` înseamnă că spațiul a fost refuzat. Doar acceptări dau `bound` egal cu cea mai mică separare acceptată, o limită inferioară observată. Dacă există și refuzuri, rezultatul expune intervalul `[max(refused), min(accepted)]`; interval inversat este `REFUSED`, deoarece observațiile nu delimitează un prag monoton coerent. Cadrele repetate sunt eliminate după `opportunity.id + occurrence`.

## Limite

Estimatorul depinde de completitudinea callerului: 086 oferă denominatorul cumulativ, dar faptele concrete și cauza STOP sunt furnizate separat. Tick rate-ul pentru dwell este 60 Hz conform contractului existent. Nu determină fapte lipsă, nu execută scenarii și nu oferă integrare worker/profil, comportament de joc sau măsurători browser/GPU/FPS.
