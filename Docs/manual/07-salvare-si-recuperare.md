# 7. Salvare, export și recuperare din fișier

## Trei lucruri care nu sunt același lucru

| Ce | Ce este | Ce conține |
| --- | --- | --- |
| Autosave în browser | starea salvată automat în stocarea browserului | sesiunea curentă |
| Export de profil | o acțiune separată pentru stilul de condus | profilul (parametrii și dovezile) |
| **Savefile `.sdasave`** | backup complet, într-un fișier JSON | ambele sesiuni, economia, decorul, opțional replay-uri |

Un export de profil **nu** conține XP, daily sau istoric comercial. Un savefile complet **nu** este un
export de profil. Confuzia dintre ele este cea mai frecventă sursă de „mi-am pierdut progresul”.

## Acțiunile de fișier

Contractul de UI (documentul modulului 29) prevede în meniul de pauză și pe ecranul inițial două
acțiuni:

- **„Salvează jocul în fișier”** — pune sesiunea pe pauză, închide segmentul, capturează o generație
  coerentă și pregătește fișierul pentru descărcare.
- **„Încarcă jocul din fișier”** — validează fișierul, arată un sumar, cere confirmarea, apoi înlocuiește
  sesiunea.

În cod, acestea sunt `exportSaveFile(...)` și `createSaveFileStore(...).preview` / `.import`. Butoanele
de meniu propriu-zise sunt compuse de host; bootstrapul din `src/main.ts` nu le montează încă. Starea
afișată este explicită: **`FILE_READY`** înseamnă „fișier pregătit pentru descărcare”, iar
**`AUTOSAVE_SAVED`** înseamnă „autosave în browser”. Sunt stări distincte, nu sinonime.

Browserul **nu poate confirma scrierea pe disc**. Contractul raportează structural
`claimsBrowserWrite: false`; jocul nu pretinde că fișierul a ajuns pe disc doar pentru că descărcarea a
fost inițiată.

Exportul și importul au patru pași cu fracție 0–1 și `cancel()`. Anularea este cooperativă între faze și
înainte de commit; o anulare înainte de commit lasă baza neatinsă.

## Ce conține fișierul

Envelope-ul are exact:

```
format = "self-driving-academy-save"
formatVersion = 1
integrityVersion = 1
schemaVersion = 1
createdAt
payload
checksum = { algorithm: "SHA-256", canonicalization: "SDA-CJSON-1", value }
```

`payload` conține:

| Slot | Conținut |
| --- | --- |
| `versions` | engine, physics, map și schema `234-savefile-schema-1` |
| `sessions.ACADEMY` / `sessions.CHAOS` | documentul fiecărei sesiuni: checkpoint, progres, campanie, setări, referință de profil, scenarii, daily, ledger economic și XP |
| `decor.ACADEMY` / `decor.CHAOS` | snapshotul decorului destructibil, cu `sessionId`, `worldEpoch` și checksum propriu |
| `optional.replays` | maximum 4 replay-uri, cu dimensiunea decodată declarată |
| `sizes` | bytes canonici pe slot, totalul și plafonul |

`null` înseamnă slot **absent**, nu sesiune goală. Cele două sesiuni sunt păstrate separat: un fișier cu
același `sessionId` în ambele sloturi este refuzat (`DUPLICATE_SESSION`). XP-ul total raportat este suma
soldurilor, nu o fuziune. Replay-urile sunt opționale și nu invalidează fișierul când lipsesc.

## Cum se verifică checksum-ul

- Checksum-ul este **SHA-256** peste bytes UTF-8 ai formei canonice `SDA-CJSON-1` a întregului envelope
  **fără câmpul top-level `checksum`**. Deci acoperă metadatele, ambele sesiuni cu toate componentele,
  ambele snapshoturi de decor, replay-urile și bilanțul de mărime; checksum-ul nu se include pe sine.
- Forma canonică `SDA-CJSON-1` este versionată și comună pentru export și import: chei sortate UTF-16 la
  fiecare nivel, ordinea array-urilor păstrată, fără whitespace, `-0` devine `0`, numai valori JSON
  finite, chei periculoase refuzate, chei duplicate refuzate **înainte** de hashing.
- `computeSaveFileChecksum` este folosit și la construcție, și la citire: nu există o a doua formulă.
- **Indentarea și ordinea cheilor din fișier pot fi schimbate fără eroare**, dacă datele rămân identice.
  O schimbare de XP, profil, decor, metadate sau alt câmp acoperit, fără recalcularea checksum-ului,
  produce eroarea „Fișierul a fost modificat sau este corupt. Jocul nu a fost încărcat.”
  (cod `CHECKSUM_MISMATCH`).
- Nu există buton pentru ignorarea erorii.

## Ordinea la citire și refuzurile

Ordinea reală este: buget de bytes/adâncime → parsare strictă → `format`/`formatVersion`/
`integrityVersion` → formă canonică și buget → checksum → `schemaVersion` și schemă → sloturile de
sesiune/decor/replay → bilanțul de mărime.

Verificarea checksum-ului **precede** schema și migrarea. Un checksum recalculat corect nu face o schemă
invalidă acceptabilă.

| Ce s-a întâmplat | Codul afișat intern |
| --- | --- |
| ai editat fișierul fără să recalculezi checksum-ul (inclusiv XP) | `CHECKSUM_MISMATCH` |
| chei duplicate în text | `DUPLICATE_KEY` |
| fișier trunchiat / conținut după document | `PARSE_ERROR` / `TRAILING_CONTENT` |
| fișier peste plafon | `FILE_TOO_LARGE` |
| checksum lipsă / algoritm sau canonicalizare necunoscute | `MISSING_FIELD` / `UNSUPPORTED_ALGORITHM` / `UNSUPPORTED_CANONICALIZATION` |
| reguli de integritate necunoscute | `UNSUPPORTED_INTEGRITY` |
| format mai nou decât build-ul | `FORMAT_VERSION_TOO_NEW` |
| schemă mai nouă sau necunoscută, cu checksum valid | `SCHEMA_TOO_NEW` / `UNSUPPORTED_SCHEMA` |
| și schemă nouă, și checksum stricat | `CHECKSUM_MISMATCH` (checksum-ul este primul) |
| replay invalid / peste plafon | `REPLAY_INVALID` / `REPLAY_TOO_LARGE` |
| contor nesigur / număr invalid | `INVALID_COUNTER` / `INVALID_NUMBER` |
| decor din altă sesiune sau altă epocă | `DECOR_SESSION_MISMATCH` |
| două sloturi cu același `sessionId` | `DUPLICATE_SESSION` |
| slot activ absent / fișier fără sesiune | `ACTIVE_SESSION_MISSING` / `SAVEFILE_EMPTY` |
| arhivă de sesiune simplă, nu savefile | `LEGACY_SAVEFILE` |
| înlocuire fără sumar sau cu alt sumar | `PREVIEW_REQUIRED` / `PREVIEW_STALE` |
| al doilea tab | `WRITER_REQUIRED` |
| anulare sau lume nestagabilă | `CANCELLED` / `WORLD_PREPARE_FAILED` |

**Un fișier refuzat nu atinge sesiunea**: citirea nu scrie nimic, iar importul verifică tot fișierul
înainte de prima scriere.

## Cum se face înlocuirea

1. **Sumar.** `preview` validează fișierul și întoarce sumarul lui — sesiuni, checkpoint, XP, nivel,
   daily, scenarii, decor, replay-uri, checksum, bytes — împreună cu starea curentă a sesiunilor pe care
   le-ar înlocui. Nu scrie nimic.
2. **Confirmare.** Importul cere identitatea exactă a acelui preview (`confirmation.previewId`), deci nu
   poți aproba alt fișier decât cel afișat. Un sumar vechi produce `PREVIEW_STALE`.
3. **Pregătirea lumii.** Un port de lume pregătește o generație nouă și restaurează decorul prin
   contractul lui, **fără** să atingă lumea live.
4. **O singură tranzacție.** Sunt înlocuite ambele sesiuni (profiluri, activări, checkpointuri, progres,
   setări, scenarii și economia). În aceeași tranzacție, fiecare slot este recitit și comparat cu arhiva:
   digesturi, total XP, sold micro-XP, recompense daily, decontări.
5. **Publicare.** Numai după commit este publicată lumea pregătită. Un refuz sau o anulare o aruncă și
   lasă baza byte cu byte neschimbată.

Recompensele sunt **înlocuite, nu adunate**: nu există niciun apel de decontare, credit de misiune,
credit daily sau înregistrare de recompensă pe calea de import. Un fișier cu 100,5 XP importat peste o
sesiune goală lasă 100,5 XP, iar un al doilea import al aceleiași arhive raportează `xpDelta 0` și
păstrează o singură recompensă daily. După o înlocuire reușită, jocul pornește în **pauză/AUTO**, cu
inputul eliberat și zero vehicule în MANUAL.

## Limite de mărime

Plafoanele derivă din straturile deja livrate:

| Limită | Valoare |
| --- | --- |
| Un slot de sesiune (cu envelope-ul lui) | 3 215 360 B |
| Un snapshot de decor | 65 536 B |
| Replay-uri opționale | maximum 4 intrări, 4 MiB decodificați |
| Fișierul întreg | 12 285 272 unități de cod |

O componentă peste plafon este **refuzată explicit, niciodată trunchiată**. O declarație de mărime care
nu corespunde măsurătorii reale este `SIZE_MISMATCH`. Memoria este raportată ca bytes deținuți de
documente, nu ca heap total: `totalHeapBytes` rămâne `null` în manifestul de bugete și nu este inventat.

## Ce **nu** poate face checksum-ul

- **Nu este semnătură.** Detectează modificarea fără recalculare și coruperea, dar nu garantează
  anti-cheat.
- Cine modifică payload-ul **și recalculează corect** checksum-ul poate trece verificarea de integritate —
  dar trebuie să treacă în continuare schema, componentele de sesiune, economia și restaurarea decorului.
  Un fișier rescris și re-stampat corect este deci încă refuzat dacă lumea, progresul sau economia nu mai
  reproduc contractele lor.
- Jocul local nu păstrează o cheie secretă pretins sigură și nu promite un scor verificat de server.
- **Nu există „reparare automată”.** Un fișier corupt este refuzat, nu reparat pe ascuns. Un checkpoint
  care trimite la un profil inexistent este refuzat (`PROFILE_VERSION_MISSING`), nu completat cu o
  valoare inventată.
- Un fișier cu `formatVersion` mai mare este refuzat explicit, nu interpretat optimist. O arhivă de
  sesiune veche (versiunea 1 sau 2) este refuzată de cititorul de savefile cu `LEGACY_SAVEFILE` și poate
  fi împachetată explicit într-un savefile printr-o migrare, păstrând documentul interior și checksum-ul
  lui.
- Al doilea tab este refuzat cu `WRITER_REQUIRED`: un singur tab are drept de scriere.

## Recuperarea, pe scurt

Recuperarea nu este doar fișierul. Ai trei mecanisme distincte, descrise în
[secțiunea 3](03-academie-haos-recuperare.md):

- `R` / **„Deblochează mașina”** — repoziționează vehiculul controlat, fără să atingă progresul.
- **„Oraș proaspăt, păstrează stilul”** — reface lumea, păstrează profilul și XP.
- **„Restaurează stilul”** — activează o versiune de profil, fără să repare lumea.

Iar la nivel de randare, după pierderea GPU scena este reconstruită din ultimul checkpoint din memorie,
cu tick-ul neschimbat și generația avansată; după două eșecuri consecutive apare eroarea cu buton de
reîncercare, iar reîncercarea revine cu același checkpoint.
