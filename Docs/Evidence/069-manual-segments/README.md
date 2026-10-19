# Dovezi PBI069 — lifecycle de segmente manuale și LEARNING

Acest arbore de dovezi a fost **recuperat în `main` pe 2026-10-19** din ramura `loop-pbi/manual-segments-01`
(worktree `manual-segments-01`) de către ordonatorul `loop-pbi`, împreună cu codul livrat
(`src/telemetry/intervention-*.ts`, `src/app/manual-segment-bridge.ts`), testele, scripturile de harness și
`Docs/manual-segments.md`. Verdictul de acceptare și limitele rămân cele consemnate în
[PBI 069](../../../PBI/Done/069-manual_segments.md); contractul public este în
[manual-segments.md](../../manual-segments.md).

## Ce conține arborele

- `native-before-*` / `native-after-*` — capturi native cronologice (BEFORE, apoi încercările AFTER,
  inclusiv cele respinse sau depășite de timp de măsurare), cu `manifest.json`, `first-world.json` și
  marcaje de eșec acolo unde au existat;
- `*scoped-checks-*`, `implementation-scoped-checks-*`, `optimization-checks-*` — verificări scoped
  (format, tipuri, lint, arhitectură, teste pure) și receipt-ul de optimizare a contabilității de octeți;
- `record-stage-diagnostic-*`, `parsed-record-reuse-checks-*`, `correctness-current-*`,
  `mobile-rebaseline-attempts-*` — diagnostice de timp pe stadii, reutilizare de înregistrări parsate,
  corectitudine curentă și încercări de re-baseline respinse (păstrate, nu șterse);
- `reference-scoped-checks-*`, `native-archive-cli-diagnostic-*` — verificări ale referinței și
  diagnosticul de arhivare.

Unele foldere conțin copii `source/` ale surselor la momentul măsurării (convenția proiectului de a
îngheța exact ce s-a măsurat). Nu modifica aceste copii: ele fixează build-ul măsurat.

## Verificat la recuperare

- `npm run check` EXIT 0 pe `main` după integrare (typecheck, lint, format:check, arhitectură și
  951/951 teste, inclusiv suitele `tests/telemetry/manual-segments*.test.ts`);
- `node --import ./scripts/register-typescript.mjs --test tests/telemetry/manual-segments-*.test.mjs`
  34/34 PASS;
- `npm run check:parameter-catalog` EXIT 0.

Probele native înregistrate aici **nu** au fost re-rulate la recuperare; ele rămân măsurătorile
proprietarului, cu etichetele de calibrare și exceptarea consemnată în PBI 069. Nu se pretinde o probă
de browser, FPS, hardware sau RAM totală.
