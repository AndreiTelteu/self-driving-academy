# 177 — raport politică extinsă pentru schimbare de bandă și depășire

Generat de `scripts/run-v2-lane-policy-report.mjs` din contractul `177-lane-policy-v2`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| durata manevrei | schimbare validată pe banda stângă, fără semnalizare: progresul lateral măsurat 30 de tick-uri după începutul manevrei (0 = banda de plecare, 1 = banda țintă) |
| semnalizare înainte de manevră | schimbare validată pe banda stângă, cu semnalizarea folosită: numărul de tick-uri dintre decizie și prima mișcare laterală |
| folosirea semnalizării | schimbare validată pe banda stângă, fără avans de semnalizare: indicatorul este pornit sau nu |
| depășire prin dreapta | schimbare validată pe banda dreaptă, cu harta care permite depășirea prin dreapta și 30 m de spațiu liber: dacă oportunitatea de depășire este acceptată |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `lane_change_duration` | durata manevrei | 0.5 | 0.500 | 5 | 0.100 | -0.400 | ratio | durata efectivă este `max(cheie, 1 s)`; la 30 de tick-uri după start, 0,5 s (plafonat la 60 de tick-uri) dă 0,500, iar 5 s (300 de tick-uri) dă 0,100 |
| `signal_lead_time` | semnalizare înainte de manevră | 0 | 0.000 | 5 | 300.000 | 300.000 | ticks | avansul se aplică numai când semnalizarea este folosită; 0 s pornește manevra în același tick, 5 s o ține 300 de tick-uri, cu progres lateral 0 |
| `signal_use_probability` | folosirea semnalizării | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | un singur eșantion determinist per oportunitate; eșantionul acestei oportunități este 0.324830 |
| `pass_on_right_probability` | depășire prin dreapta | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | eșantionul oportunității este 0.249755; probabilitatea este consultată numai după ce harta permite și spațiul acoperă `lane_change_front_gap` |

## Separarea cheilor (fiecare cheie inertă în celelalte scenarii)

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `signal_lead_time` | durata manevrei | 0 | 0.250 | 5 | 0.250 | 0.000 | ratio | `signal_lead_time` este inertă în scenariul durata manevrei |
| `signal_use_probability` | durata manevrei | 0 | 0.250 | 1 | 0.250 | 0.000 | ratio | `signal_use_probability` este inertă în scenariul durata manevrei |
| `pass_on_right_probability` | durata manevrei | 0 | 0.250 | 1 | 0.250 | 0.000 | ratio | `pass_on_right_probability` este inertă în scenariul durata manevrei |
| `lane_change_duration` | semnalizare înainte de manevră | 0.5 | 300.000 | 5 | 300.000 | 0.000 | ticks | `lane_change_duration` este inertă în scenariul semnalizare înainte de manevră |
| `pass_on_right_probability` | semnalizare înainte de manevră | 0 | 300.000 | 1 | 300.000 | 0.000 | ticks | `pass_on_right_probability` este inertă în scenariul semnalizare înainte de manevră |
| `lane_change_duration` | folosirea semnalizării | 0.5 | 1.000 | 5 | 1.000 | 0.000 | ratio | `lane_change_duration` este inertă în scenariul folosirea semnalizării |
| `signal_lead_time` | folosirea semnalizării | 0 | 1.000 | 5 | 1.000 | 0.000 | ratio | `signal_lead_time` este inertă în scenariul folosirea semnalizării |
| `pass_on_right_probability` | folosirea semnalizării | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `pass_on_right_probability` este inertă în scenariul folosirea semnalizării |
| `lane_change_duration` | depășire prin dreapta | 0.5 | 1.000 | 5 | 1.000 | 0.000 | ratio | `lane_change_duration` este inertă în scenariul depășire prin dreapta |
| `signal_lead_time` | depășire prin dreapta | 0 | 1.000 | 5 | 1.000 | 0.000 | ratio | `signal_lead_time` este inertă în scenariul depășire prin dreapta |
| `signal_use_probability` | depășire prin dreapta | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `signal_use_probability` este inertă în scenariul depășire prin dreapta |

## Dependența explicită dintre chei

| Cheie | Scenariu | Diferență | Motiv |
| --- | --- | ---: | --- |
| `signal_use_probability` | semnalizare înainte de manevră | 300.000 | avansul de semnalizare există numai când semnalizarea este folosită; fără indicator manevra pornește în tick-ul validării, deci cheia de semnalizare deblochează avansul |

## Siguranță: plafoanele, avansul și subordonarea rămân dominante

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `podeaua duratei` | durata efectivă a manevrei la minimul de catalog 0,5 s și la maximul de 5 s | 0.5 | 60.000 | 5 | 300.000 | 240.000 | ticks | durata efectivă este `max(cheie, 1 s)`: 60 de tick-uri la 0,5 s și 300 la 5 s, deci nicio valoare admisă nu schimbă banda instantaneu |
| `durata zero refuzată` | cheia 0 s (sub minimul de catalog) și 0,5 s | 0 | 0.000 | 0.5 | 1.000 | 1.000 | ratio | 0 s nu este o durată admisibilă; podeaua de politică rămâne 1 s |
| `dreapta interzisă` | harta declară depășirea prin dreapta interzisă, cheia maximă | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | comanda rămâne RIGHT_OVERTAKE_FORBIDDEN, fără eșantion (null) |
| `dreapta nedeclarată` | harta nu declară permisiunea, cheia maximă | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | necunoscutul este refuzat ca și interdicția: RIGHT_OVERTAKE_FORBIDDEN |
| `dreapta fără spațiu` | 8 m liberi în banda dreaptă, sub `lane_change_front_gap` 12 m, cheia maximă | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | RIGHT_OVERTAKE_NO_SPACE; spațiul cerut este 12 m |
| `dreapta fără spațiu declarat` | spațiul din banda dreaptă nedeclarat, cheia maximă | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | RIGHT_OVERTAKE_NO_SPACE; un spațiu necunoscut nu este tratat ca liber |
| `stânga nu consultă cheia de dreapta` | schimbare validată pe banda stângă, cheia maximă | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | manevra pornește fără eșantion de dreapta: requested false, sample null |
| `avansul nu pornește pe continuitate` | 053 raportează `COMMITTED_CONTINUITY` în timpul avansului de 2 s | 0 | 0.000 | 2 | 0.000 | 0.000 | ratio | SIGNAL_LEAD_STALE; validarea proaspătă din același tick rămâne SIGNAL_LEAD |
| `avansul anulat de 053` | 053 refuză în timpul avansului, cu cheile la maxim | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | SIGNAL_CANCELLED; latch-ul este eliberat (null) |
| `053 domină toate cheile` | 053 refuză cu `INSUFFICIENT_FRONT_GAP`, toate cheile la maxim | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | NO_LANE_CHANGE (INSUFFICIENT_FRONT_GAP); nicio cheie nu pornește manevra |
| `053 indisponibil` | rezultat 053 `UNKNOWN`, cheile la maxim | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | LANE_CHANGE_UNAVAILABLE; stratul nu inventează o manevră |
| `manevra abandonată` | 053 nu mai validează în timpul manevrei, după 10 tick-uri | 0 | 0.000 | 5 | 0.000 | 0.000 | ratio | MANOEUVRE_ABANDONED; progresul raportat la abandon este 0.033 |

## Compatibilitate cu cheile M

- Rezultate 053 identice cu cheile R neutre vs active: **60/60 tick-uri**.
- Comenzi neutre identice cu 053: **50/50** (schimbări pe stânga și schimbări pe dreapta care nu sunt depășiri).
- Depășiri prin dreapta refuzate de cheia neutră 0: **10** tick-uri.
- Tick-uri active care diferă de comanda neutră: **30**, diferență maximă de progres lateral **0.492**.
- Unități M: `lane_change_front_gap` m, `lane_change_back_gap` m, `lane_change_speed_gain` m/s, `lane_change_cooldown` s.
- Unități R: `lane_change_duration` s, `signal_lead_time` s, `signal_use_probability` probability, `pass_on_right_probability` probability.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `lane_change_duration` | s | 0.5 | 5 | 2 |
| `signal_lead_time` | s | 0 | 5 | 1 |
| `signal_use_probability` | probability | 0 | 1 | 1 |
| `pass_on_right_probability` | probability | 0 | 1 | 0 |

## Determinism

- 6 tick-uri: `fnv1a32:71505a55`.
- Rulare repetată: `fnv1a32:71505a55`.

## Verificări

- PASS `key-duration-effect`: progres după 30 de tick-uri: 0.5 s -> 0.500, 5 s -> 0.100
- PASS `key-duration-floor`: durata efectivă la 0,5 s este 60 tick-uri, progres 0 la start
- PASS `key-duration-not-instant`: 0 s este refuzat de catalog, iar 0,5 s este ridicat la podeaua de 1 s
- PASS `key-lead-effect`: întârziere 0 -> 300 tick-uri
- PASS `key-signal-effect`: indicator 0 -> 1, eșantion 0.324830
- PASS `key-right-effect`: depășire prin dreapta 0 -> 1, eșantion 0.249755
- PASS `safety-right-forbidden`: harta interzice: refuz înaintea eșantionului
- PASS `safety-right-unknown`: permisiunea nedeclarată este refuzată închis
- PASS `safety-right-space`: 8 m și spațiul nedeclarat refuză cheia 1; cerința 12 m
- PASS `safety-right-left-inert`: o schimbare pe stânga nu este depășire prin dreapta
- PASS `safety-lead-stale`: avansul nu pornește manevra pe un latch 053 vechi
- PASS `safety-lead-fresh`: aceeași stare cu validare proaspătă rămâne în avans
- PASS `safety-lead-cancelled`: refuzul 053 anulează avansul și eliberează latch-ul
- PASS `safety-lane-change-dominant`: refuzul 053 rămâne dominant cu toate cheile la maxim
- PASS `safety-lane-change-unknown`: rezultatul 053 indisponibil rămâne UNKNOWN
- PASS `safety-manoeuvre-abandoned`: o manevră începută este abandonată când 053 nu mai validează
- PASS `separation-independent`: 11 perechi inerte cu diferența 0, plus dependența explicită signal_use_probability -> signal_lead_time (300 tick-uri)
- PASS `m-identical-delivered-results`: 60/60 rezultate 053 identice cu cheile R neutre vs active
- PASS `m-neutral-forwards`: 50/50 comenzi neutre identice cu 053; 10 depășiri prin dreapta refuzate de cheia neutră 0; 30 tick-uri active diferă
- PASS `catalog-ranges`: lane_change_duration 0.5-5 s, signal_lead_time 0-5 s, signal_use_probability 0-1 probability, pass_on_right_probability 0-1 probability
- PASS `units`: lane_change_duration s, signal_lead_time s, signal_use_probability probability, pass_on_right_probability probability
- PASS `determinism`: digest fnv1a32:71505a55

**Sumar: 22/22 verificări, PASS.**
