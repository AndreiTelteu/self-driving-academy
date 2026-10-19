# Regularizare, adaptare și memorii recente — PBI 101

`src/learning/profile-blend.ts` aplică un update mărginit peste profilul curent:

```
newValue = oldValue + learningWeight × (estimate − oldValue)
```

Modulul consumă evaluarea 100 (`assessEvidenceConfidence`) și read model-ul 093, păstrează
provenance pentru fiecare actualizare și este exportat prin `src/learning/index.ts`. Rezultatul
este exclusiv în memorie: `published: false`, `learned: false`, fără profil publicat, fără
`LEARNED` și fără modificarea `implemented`/`estimable` din 092.

## API

- `blendProfileValue(input)` — o actualizare pentru o cheie. `input` conține `key`, `oldValue`,
  `evidence` (read model 093 sau `null`), `episodes`, `candidate` și opțional `history`.
- `PROFILE_BLEND_POLICY` — constantele de calibrare, înghețate.
- `PROFILE_BLEND_VERSION` — `101-profile-blend-v1`.
- `ProfileBlendEpisode` — episodul 100 plus `ageSeconds` (secunde față de momentul blend-ului;
  `0` este observația proaspătă).
- `ProfileBlendUpdate` / `ProfileBlendResult` — actualizarea și rezultatul, ambele înghețate.

Intrările invalide sunt respinse: `oldValue` non-finit, `ageSeconds` negativ sau non-finit,
`occurrence` invalid, expunere negativă, iar un `history` care aparține altei chei aruncă eroare.
Intrarea nu este mutată.

## Ponderea de învățare

`learningWeight` este produsul a patru factori, apoi limitat:

1. **Calitatea dovezilor** — `quality` din 100 (0 pentru `UNOBSERVED`/`WEAK`).
2. **Saturația numărului efectiv** — `E / (E + 4)`, unde `E` este `effectiveEpisodeCount`.
   Un episod efectiv dă 0,2; trei dau 0,43; douăsprezece dau 0,75. Numărul efectiv, nu numărul de
   cadre sau eșantioane, controlează creșterea.
3. **Recența** — media recenței reprezentanților, ponderată cu expunerea:
   `decay(age) = max(0,05, 0,5 ^ (age / 86 400 s))`. Timpul de înjumătățire este de 24 h, iar
   podeaua de 5% păstrează dovezile foarte vechi fără să le elimine.
4. **Contradicția** — `NONE` = 1, `MODERATE` = 0,5, `SEVERE` = 0.

Limitele per actualizare sunt documentate și înghețate în `PROFILE_BLEND_POLICY`:

| Limită | Valoare | Efect |
| --- | --- | --- |
| `maxUpdateWeight` | 0,6 | niciun segment nu poate înlocui profilul într-un pas |
| `novelEvidenceWeightCap` | 0,15 | o demonstrație cu mai puțin de 2 episoade efective nu devine obicei |
| `saturationEpisodes` | 4 | ritmul de creștere al ponderii cu numărul efectiv |
| `recencyHalfLifeSeconds` | 86 400 | timpul de înjumătățire al recenței |
| `recencyFloor` | 0,05 | contribuția minimă a dovezilor vechi |
| `moderateContradictionFactor` | 0,5 | pas redus la dispersie moderată |

Valoarea este rotunjită la patru zecimale și apoi limitată la `min`/`max` din 092; limita este
singura constrângere dură și este raportată prin `clampedToBounds`. Nu există nicio contracție
suplimentară către valoarea de bază.

## Recența și memoria

Reprezentanții sunt aceiași ca la numărul efectiv 100: cadrele aceleiași apariții
(`opportunityId` + `occurrence`) se pliază pe expunerea maximă, iar grupurile `correlatedWith` se
pliază pe membrul cel mai expus. Astfel recența nu este umflată de cadre repetate sau de mai multe
ferestre ale aceluiași lider. Fiecare reprezentant contribuie cu
`min(1, observedTicks / minimumEpisodeTicks)`, deci un episod scurt contează fracționar.

Consecința practică: un obicei vechi nu este rescris de un singur segment, iar un stil nou repetat
în episoade recente câștigă treptat. După destule episoade recente, recența medie urcă și pasul
ajunge la limita de 0,6, astfel încât jucătorul își poate schimba stilul. Dovezile vechi rămân în
memorie la podeaua de 5%, nu sunt șterse.

## Stări și contradicții

| Rezoluție | Când | Valoarea |
| --- | --- | --- |
| `APPLIED` | dovezi suficiente, estimate punctual | `oldValue + learningWeight × (estimate − oldValue)` |
| `APPLIED_WITH_INTERVAL` | contradicție `MODERATE` | pas aplicat la jumătate, intervalul este păstrat |
| `HELD_INTERVAL_ONLY` | `OBSERVED` doar cu interval, fără valoare punctuală | neschimbată, intervalul este păstrat |
| `HELD_CONTRADICTION` | contradicție `SEVERE` | neschimbată, `learningWeight = 0`, intervalul este păstrat |
| `HELD_WEAK` | dovezi sub prag, episoade scurte/corelate, candidat indisponibil | neschimbată |
| `HELD_UNOBSERVED` | niciun episod eligibil sau read model fără dovezi | neschimbată |

`UNOBSERVED` și `WEAK` nu produc niciodată o valoare nouă. `ZERO` este o valoare observată reală:
`estimate = 0` și este aplicat cu ponderea calculată, nu sărit. O contradicție severă nu este
mediată: valoarea rămâne veche, iar intervalul observat rămâne în rezultat. Dispersia moderată
păstrează starea `OBSERVED` din 100, dar pasul este înjumătățit suplimentar față de penalizarea de
calitate 0,6, deci nu este aplicată la pondere plină.

## Fără conformare forțată

Regularizarea din acest modul este exclusiv pasul mărginit către estimarea observată. Nu există un
termen care să tragă valoarea către profilul de bază, către `default` sau către o bandă „sigură”.
Un stil riscant susținut de dovezi consistente se mișcă spre estimarea riscantă, iar un stil extrem
deja observat rămâne aproape de extremă când dovezile îl susțin. Limita de 0,6 și plafonul de 0,15
pentru o demonstrație singulară limitează zgomotul, nu elimină un stil consistent. Limitarea la
intervalul 092 este o constrângere de validitate, nu o conformare comportamentală.

## Provenance

Fiecare `ProfileBlendUpdate` păstrează `sequence`, valoarea veche, estimarea, valoarea nouă,
`learningWeight`, `quality`, `countSaturation`, `effectiveEpisodeCount`, `distinctEpisodeCount`,
`recencyFactor`, starea dovezilor, severitatea contradicției, intervalul, rezoluția, `changed`,
`clampedToBounds`, identitățile episoadelor (`opportunityId#occurrence`) și vârsta minimă/maximă.
`history` concatenă actualizările anterioare primite de la apelant, astfel încât panelul poate
explica fiecare pas. Istoricul și toate câmpurile sunt înghețate.

## Integrare

`blendProfileValue` apelează `assessEvidenceConfidence` din 100 și `confidenceThreshold` pentru
podeaua de expunere. Limitele `min`/`max` și unitatea vin din registrul 092 printr-o citire
`getParameterDefinition`; registrul nu este scris. Modulul nu publică, nu creează versiuni de
profil, nu marchează `LEARNED` și nu activează `estimable`.

## Limitări

Apelantul furnizează identitatea oportunității, expunerea măsurată, grupurile de corelare și ceasul
pentru `ageSeconds`; modulul nu le deduce din fizică sau geometrie. Timpul de înjumătățire de 24 h,
podeaua de recență de 5%, saturația de 4 episoade și plafoanele 0,6/0,15 sunt calibrare de pornire,
nu garanții statistice. Modulul nu are worker, persistență, buclă live, publicare de profil,
integrare cu panoul jucătorului ori probe browser/playtest. Nu modifică 092 și nu înlocuiește
validarea 100 sau contractele 094–099.
