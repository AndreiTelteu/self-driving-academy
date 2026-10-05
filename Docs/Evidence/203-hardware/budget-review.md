# Revizuirea contractului inițial de bugete

Stare: contract inițial versionat, cu bugete gameplay provizorii. Utilizatorul a omis explicit testul laptopului pentru 203 la 5 octombrie 2026; acesta nu are rezultat măsurat. Desktopul disponibil este high-end; măsurarea lui nu certifică automat un desktop mediu generic.

[Manifestul inițial](../../performance-budgets.json) distinge pragurile de acceptare pentru gate-urile viitoare, costul bootstrapului măsurat, plafoanele de alocare/admitere și probele care vor valida subsistemele. O scenă goală poate măsura randarea de bază, cadența și costul colectorului; nu poate dovedi tickul Rapier, contactele, latența learning-ului, capturile checkpoint sau prima cursă pe rețea limitată.

Pragurile propuse în Docs25 rămân neschimbate și provizorii în manifest. Fixture-ul de scalare este concretizat la20 taxiuri/20 civile, separat de24/40 normal,30/40 maxim și30/80 suprasarcină. Contractele worker propuse păstrează o lume experimentală rezidentă, felii de10ms, anulare în100ms și progres de maximum5Hz.

Câmpurile de capacitate încă null au acum owner și fixture în `capacityValidation`; nu sunt capacități nelimitate și nu sunt aprobate. Numărul de corpuri/contacte, obiecte vizuale și copiile checkpoint nu se pot declara calibrate din bootstrap. Gate-urile021/221/222/223/224/227 le verifică prin workloadurile respective, păstrând toate entitățile și datele protejate.

203 fixează contractul inițial cu baseline-ul desktop și derogarea laptopului; rezervele de alocare nemăsurate rămân provizorii, iar gate-urile ulterioare trebuie să stabilească plafoanele finite înaintea introducerii resurselor și să dovedească workloadul. Orice revizie a plafoanelor are versiune, motiv și comparație, fără creșterea automată a pragului pentru a accepta o regresie. Stările „bootstrap verificat”, „contract fixat” și „gameplay validat” trebuie raportate separat.
