# Dovezi 115 — vertical slice determinist

Contract: `115-vertical-slice-v1`. Comanda: `npm run vertical:slice`.

Fișiere:

- [report.json](report.json) — transcriptul înghețat, comparat exact de `npm run vertical:slice -- --check`.
- [report.md](report.md) — tabelul uman generat din același raport.
- [Docs/vertical-slice.md](../../vertical-slice.md) — contractul.

Rezultat executat:

- 7 rânduri de dovezi: `PRUDENT`, `RECKLESS`, `BOTH_CATEGORIES`, `MISTAKES_VISIBLE`,
  `MANUAL_NO_CHANGE`, `UNOBSERVED_CONTEXTS`, `DETERMINISM`.
- 111/111 verificări, `PASS`.
- Două rulări independente identice byte cu byte.
- `PRUDENT`: versiune `segment-115-prudent~112`, `stop_full_probability 0.6 → 0.84`, 14
  oportunități, 0 încălcări pe taxi și pe civil.
- `RECKLESS`: versiune `segment-115-reckless~112`, `stop_full_probability 0.6 → 0.36`, 14
  oportunități, 6 încălcări `STOP` (3 pe taxi, 3 pe civil).
- `MANUAL`: `SKIPPED_MANUAL`, zero joburi/versiuni/comenzi, telemetrie 14 oportunități,
  versiune și valori neschimbate, explicație `NO_CHANGE` fără versiune.
- Taxi și civil citesc aceeași versiune și aceleași valori prin binding-ul 113; zero override-uri
  ascunse.
- Explicația 104 are 16 episoade efective pe cheie, contextul `FREE_TRAFFIC` și contextele
  neobservate explicite `GREEN`, `YIELD`, `LANE_CHANGE`.

Ce NU este dovedit:

- Nu este un playtest uman sau de browser și nu există captură de ecran.
- Nu este o probă de FPS, GPU, fizică Rapier sau hardware; planul de oportunități este o simulare
  deterministă declarată.
- Explicația 104 păstrează ID-ul compunerii 103, diferit de ID-ul versiunii stocate de 112; binding-ul
  113 este raportat cu această separare (`REASON_CODE_MISMATCH` dacă explicația ar fi atașată), nu
  cu un ID modificat.
- Contractul 104 refuză joburile `MANUAL`; explicația MANUAL este proiecția reală a rezultatului
  112 `SKIPPED_MANUAL` ca `NO_CHANGE`.

Teste: `tests/app/vertical-slice.test.ts` — 16 teste. Driver dovezi:
`tests/app/vertical-slice-report.ts` + `scripts/run-vertical-slice-report.mjs`.
