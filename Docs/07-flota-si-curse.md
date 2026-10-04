# Flotă și curse

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Sistemul de curse și flotă

O cursă are identificator, punct de preluare, destinație, moment de creare, taxi alocat, traseu și istoric de evenimente. Fluxul propus este AVAILABLE → TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED. FAILED și CANCELLED sunt rezultate explicite, cu motiv.

Pickup și dropoff se finalizează când taxiul intră în zona definită, ajunge la viteza cerută și rămâne suficient timp. Sosirea vizuală la marker fără oprire nu finalizează cursa. Pasagerul poate fi reprezentat printr-un personaj simplu sau un indicator; antrenarea stilului nu depinde de animațiile sale.

Dispecerizarea folosește inițial un cost simplu bazat pe timp estimat până la pickup și disponibilitate. Nu este învățată din stilul de condus. Traseele și alocările sunt păstrate când jucătorul schimbă taxiul. Un taxi blocat sau avariat primește un statut explicit, iar recuperarea sa este înregistrată.

Lista flotei afișează ID, mod de control, etapa cursei, pickup, destinație, ETA estimat, viteză, profil aplicat și eventualul motiv al blocajului. Sortarea după ID este stabilă; filtrele permit taxiuri disponibile, în cursă, blocate și selectate.
