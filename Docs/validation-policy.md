# Validare proporțională cu schimbarea

Politică `targeted-validation-v1`, aprobată la 8 octombrie 2026. Completează [contractul de performanță](25-performanta-contracte-si-benchmark.md). Nu modifică bugetele numerice, semantica jocului sau dovezile istorice.

## Niveluri și închidere

| Nivel | Când | Probe și rezultat |
| --- | --- | --- |
| Funcțional izolat | Algoritmi, reguli, scheme, ownership, lifecycle | Scenarii deterministe, cazuri negative, limite și cleanup; fără a pretinde FPS sau cost hardware în paralel |
| Targeted | PBI obișnuit cu performance_checks | Măsurarea costului local înainte/după, capacități și integrare browser scurtă când există efect vizual/input; raport DEV pentru frame/UI |
| Full | Gate integrat, modificare a rendererului/fizicii/clockului ori regresie suspectată | Cinci perechi OFF/ON, 30 s warmup + minimum 120 s măsurare per braț, secvențial pe fiecare backend cerut |
| Soak | 159/224 și gate-uri V2/V3 care cer explicit stabilitate | Minimum 60 minute și 20 cicluri lifecycle; nu se aplică automat fiecărui PBI |

`performance_checks` selectează metricile, nu impune automat două probe de 25 minute. Pentru simulation/memory fără modificări de randare, fixture-ul nativ real măsoară algoritmul și resursele; browserul verifică integrarea, nu dublează automat benchmarkul CPU. Măsurătorile native cronometrate rămân secvențiale. Un ceas sintetic poate accelera corectitudinea, dar nu certifică debitul real sau FPS.

Un PBI targeted poate fi închis cu dovezi locale complete și cu limitele declarate; performanța jocului integrat rămâne nevalidată până la gate-ul corespunzător. Nu se bifează un criteriu explicit de hardware/full/soak cu un raport DEV. Dacă schimbarea afectează fizica, rendererul, schedulerul, copiile mari ori introduce o regresie, autorul justifică nivelul full înaintea probei. 026 păstrează proba full deja începută. Probe locale finalizate nu se rerulează doar pentru formatări/documentație sau corecții de test fără schimbarea runtime-ului măsurat.

## Protocol scurt de dezvoltare

Profilul DEV folosește trei perechi OFF/ON alternante, fiecare cu 15 s încălzire și minimum 30 s măsurare: 4,5 minute/backend, circa 9 minute pentru ambele, excluzând startup/export. Are fixtureVersion distinct terminat în `-DEV`. BEFORE și AFTER au aceeași durată, scenariu, backend, seed și hardware; nu se compară drept probe echivalente un baseline full vechi și un DEV nou. Bugetele absolute rămân aceleași. O depășire se investighează; regresia relativă >10% și >1 ms (sau >10% și >5 MiB) în minimum două din trei perechi escaladează la full. DEV are încredere statistică mai mică și nu închide gate-ul hardware/release. Raportul păstrează toate repetările, fără selectarea celor convenabile.

Gate-urile 155/156/220/224 și validările integrale V2/V3 păstrează probele full relevante. Un singur build integrat poate acoperi un grup de PBI-uri numai dacă raportul mapează fiecare criteriu/metrică la scenariul executat. Nu amortizăm probe incompatibile și nu eliminăm baseline-ul specific modificării. Cold load, first-use, anulare și input au scenarii distincte, fără 120 s steady-state aplicate artificial fiecărei acțiuni.

## Paralelizare și automatizare

Testele funcționale independente pot rula în procese separate, implicit maximum două, maximum patru explicit. Fișierele temporare, porturile și datele sunt exclusive; suitele care împart resurse sau verifică ordinea globală rămân seriale. `npm run test:isolated -- --concurrency=2 tests/harness/performance.test.ts tests/harness/validation-checkpoints.test.ts` folosește procesele izolate ale Node. Nu colectăm benchmarkuri în acest runner. Nu rulăm builduri sau alte sarcini CPU/GPU grele în timpul benchmarkului hardware. Pentru performanță paralelă sunt necesare dispozitive fizice independente cu baseline propriu.

Mai multe ferestre vizibile nu înseamnă focus simultan. Inputul și cazurile blur/pause au verificări proprii. Nu dezactivăm politica de pauză a jocului și nu eliminăm verificările de continuitate pentru a obține PASS. Operatorul este solicitat numai pentru probele care necesită efectiv input/focus fizic; controalele automate se verifică înaintea protocolului cu taste umane.

## Harness comun, preflight și reluare

Profilurile comune sunt în `src/telemetry/validation-protocol.ts`; colectorul 218 este refolosit. Scenariile noi adaugă adaptoare și verificatoare semantice, nu copii complete ale serverului/colectorului. Fixture-urile istorice rămân înghețate; migrarea unui fixture în lucru schimbă identitatea buildului și cere un nou preflight, nu modificarea rapoartelor vechi.

Înainte de full: verificări statice relevante, apoi preflight scurt care exercită backendul real, warmup/measure, capacitatea, cleanup-ul, serializarea, exportul pe server și citirea independentă. Schema/transportul/capacitatea trebuie să treacă înainte de consumul de zeci de minute. Harness-ul comun 218 activează DEV/full numai după preflight și confirmarea exportului; salvarea nu reprezintă acceptare numerică a gameplay-ului.

Checkpoint-ul este o pereche completă OFF/ON după cleanup, scrisă exclusiv și verificată prin hash. Perechile au aceeași identitate: source/artifact/budget/fixture, protocol, seed, hardware/browser/driver/power/preset/rezoluție. La reluare se păstrează perechile complete, se reface ambele brațe ale perechii întrerupte cu backend fresh și warmup integral, în ordinea alternantă originală. Nu continuăm din mijlocul simulării și nu concatenăm percentilele.

Reluarea necesită preflight nou și confirmarea condițiilor hardware/alimentare/termice comparabile. Pauza și reluarea sunt consemnate; dacă nu putem demonstra comparabilitatea, raportul rămâne diagnostic și se face o sesiune nouă. Gate-urile care cer continuitate (soak, pauze/lifecycle, scenarii persistente) nu sunt resumabile prin această regulă. Verificatorul final trebuie să valideze toate perechile, bugetele și condițiile reluării. Rapoartele vechi INCOMPLETE/FAILED rămân astfel; checkpoint-urile noi nu le convertesc retroactiv în PASS.

## Aplicare la backlog

031: matrice de frânare/viraj/contact și paritate manual/AI. 040/041/052/069: scenarii native și resurse, cu browser de integrare. 056/107: suite de comportament/telemetrie. 074/075: selecție, limite de actualizare și cost UI. 085/090/103: capacități, ownership, worker/anulare și integrare; escaladare full pentru impact frame relevant. 151/152/216/235: scenarii integrate reutilizate; 156/220: performanță full; 159/224: stabilitate și release. Alegerea scenariilor respectă dependențele și nu schimbă coloana sau statusul PBI-ului.

Harness-ul comun oferă AUTO, WEBGPU și WEBGL2; schimbarea backendului invalidează preflight-ul și cere sesiune nouă. Un lease exclusiv împiedică două probe simultane pe același server. Dacă pagina este închisă abrupt, oprește și repornește serverul deținut înainte de reluare. Pentru full reluat, verificatorul cere și revizuire explicită a condițiilor prin `--allow-resumed-pairs`; fără aceasta raportul nu închide validarea hardware. Lease-ul nu detectează sarcini străine sau servere istorice: regula de exclusivitate hardware rămâne obligatorie.
