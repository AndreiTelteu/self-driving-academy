# Rezumat offline al probei hardware

După exportul unui baseline complet, rulează din rădăcina proiectului:

```powershell
node scripts/summarize-hardware-probe.mjs 'calea-explicită/baseline.json'
```

Scriptul citește numai fișierul indicat. Scrie un singur obiect JSON compact pe stdout; un rezultat invalid produce mesaj pe stderr și exit code 1. Nu caută automat cel mai nou fișier, nu schimbă evidențele sau bugetele și nu aprobă gate-uri.

Acceptă numai fixture-ul bootstrap 203 cu cinci perechi colector oprit/pornit, warmup 30 s, măsurare 120 s, dimensiuni CSS/interne 1920×1080, focus păstrat și fără overflow Long Tasks. Verifică identitățile profil/hardware/build, digestul listei de artefacte, perechile unice, duratele reale, statisticile finite și numărul mostrelor. Timeline-ul fazelor trebuie să fie monoton și în ordinea încălzire/măsurare/agregare. activeDurationMs, măsurat din timestampurile RAF, trebuie să fie cel puțin 120000. Diferențele dintre limitele fazelor performance.now() sunt raportate separat ca diagnostic; latențele callbackurilor nu permit compararea lor cu durata RAF printr-un prag strict.

Pentru CPU și intervalul cadrelor prezintă separat colectorul oprit/pornit: mediana, minimul și maximul celor cinci valori p50/p95/p99. Nu reconstruiește percentile globale din percentilele repetărilor. Overhead-ul CPU este diferența brută pornit minus oprit pentru fiecare pereche și percentilă; valorile negative se păstrează, fără a susține o îmbunătățire cauzală.

GPU include numai repetările cu mostre disponibile și declară numărul lor. Lipsa suportului sau rezultatele încă indisponibile rămân null, nu zero. Contoarele resurselor sunt intervalele minim/maxim ale snapshoturilor de final de fază; nu reprezintă maximul din timpul execuției sau memorie exactă. Draw calls indisponibile și Long Tasks nesuportat rămân null. Numărul Long Tasks se grupează după faza declarată și verificată din timeline.

Digestul verifică consistența manifestului încorporat; scriptul nu are acces la artefactele originale și nu le autentifică byte cu byte. Inputul este un raport agregat, fără mostre brute: validarea structurală nu poate demonstra că timpii au fost măsurați pe hardware. Dovezile și identitatea buildului trebuie revizuite împreună. Bootstrap-ul gol nu certifică fizică, gameplay, flotă, input, learning sau încărcarea cold în profilul de rețea propus. PBI 203 folosește baseline-ul desktop real; baseline-ul laptopului a fost omis prin derogarea explicită a utilizatorului din 5 octombrie 2026. Parserul păstrează aceleași cerințe pentru orice raport viitor și nu fabrică un raport laptop.

Testele folosesc rapoarte sintetice pentru parser și resping smoke-ul real existent; rapoartele sintetice nu sunt evidențe hardware.

Rezumatul păstrează separat inventarul hardware.gpu din CIM și câmpul gpu raportat de engine-ul Babylon pentru adaptorul efectiv al browserului. Inventarul unui GPU fizic nu dovedește că browserul l-a utilizat; un adaptor software trebuie identificat din raport și revizuit explicit.
