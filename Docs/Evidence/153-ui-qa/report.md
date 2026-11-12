# 153 — QA vizual și accesibilitate V1

Raport determinist generat de `scripts/run-ui-qa-report.mjs` cu `npm run qa:ui`.
Capturile provin din **Chromium 156.0.8078.4**; numerele de mai jos sunt măsurători reale de DOM, nu
estimări. Regula oracolului: Un rezultat este PASS numai dacă fiecare verificare a scenariului are numărul real în limitele declarate; un scenariu STRESS nu este ascuns, ci raportat ca finding.

## Matricea

| Scenariu | Viewport (regiune) | Nivel | Captură | Verdict | Verificări |
| --- | --- | --- | --- | --- | ---: |
| hud | 1280x720 (STANDARD) | CONTRACT | capture-hud-1280x720.png | PASS | 14/14 |
| hud | 1920x1080 (LARGE) | CONTRACT | capture-hud-1920x1080.png | PASS | 14/14 |
| hud | zoom-150 (COMPACT) | CONTRACT | capture-hud-zoom-150.png | PASS | 14/14 |
| hud | zoom-200 (COMPACT) | CONTRACT | capture-hud-zoom-200.png | PASS | 14/14 |
| hud | zoom-200-720 (COMPACT) | STRESS | capture-hud-zoom-200-720.png | FAIL | 13/14 |
| fleet | 1280x720 (STANDARD) | CONTRACT | capture-fleet-1280x720.png | PASS | 14/14 |
| fleet | zoom-200-720 (COMPACT) | STRESS | capture-fleet-zoom-200-720.png | FAIL | 13/14 |
| notifications | 1280x720 (STANDARD) | CONTRACT | capture-notifications-1280x720.png | PASS | 14/14 |
| notifications | zoom-150 (COMPACT) | CONTRACT | capture-notifications-zoom-150.png | PASS | 14/14 |
| profile | 1280x720 (STANDARD) | CONTRACT | capture-profile-1280x720.png | PASS | 14/14 |
| profile | 1920x1080 (LARGE) | CONTRACT | capture-profile-1920x1080.png | PASS | 14/14 |
| profile | zoom-150 (COMPACT) | CONTRACT | capture-profile-zoom-150.png | PASS | 14/14 |
| profile | zoom-200 (COMPACT) | CONTRACT | capture-profile-zoom-200.png | PASS | 14/14 |
| profile | zoom-200-720 (COMPACT) | STRESS | capture-profile-zoom-200-720.png | FAIL | 13/14 |
| city | 1280x720 (STANDARD) | CONTRACT | capture-city-1280x720.png | PASS | 14/14 |
| city | 1920x1080 (LARGE) | CONTRACT | capture-city-1920x1080.png | PASS | 14/14 |
| settings | 1280x720 (STANDARD) | CONTRACT | capture-settings-1280x720.png | PASS | 14/14 |
| settings | zoom-150 (COMPACT) | CONTRACT | capture-settings-zoom-150.png | PASS | 14/14 |
| settings | zoom-200 (COMPACT) | CONTRACT | capture-settings-zoom-200.png | PASS | 14/14 |
| camera | 1280x720 (STANDARD) | CONTRACT | capture-camera-1280x720.png | FAIL | 13/14 |
| kpis | 1280x720 (STANDARD) | CONTRACT | capture-kpis-1280x720.png | FAIL | 12/14 |
| kpis | 1920x1080 (LARGE) | CONTRACT | capture-kpis-1920x1080.png | FAIL | 12/14 |

Total: 22 capturi (19 CONTRACT,
3 STRESS), 308 verificări,
300 trecute, 8 eșuate (5 în
nivelul CONTRACT), 8 findings, verdict CONTRACT **FAIL**.

Un finding este o verificare reală care a picat, cu captura și pașii de reproducere alături; PBI 153
nu repară `src/`, deci findings-urile rămân pentru PBI-urile proprietare. Rularea raportului reușește
când raportul este coerent; `npm run qa:ui -- --strict` transformă un finding CONTRACT în exit code 1.

## Comparația aceleiași componente la rezoluții diferite

### hud

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 352 | 313.44 | 12 | 1.4 | 311 / 311 | PASS |
| 1920x1080 | LARGE | 352 | 322.42 | 12 | 1.4 | 320 / 320 | PASS |
| zoom-150 | COMPACT | 240 | 332.63 | 12 | 1.4 | 331 / 331 | PASS |
| zoom-200 | COMPACT | 240 | 332.63 | 12 | 1.4 | 331 / 331 | PASS |
| zoom-200-720 | COMPACT | 240 | 332.63 | 12 | 1.4 | 331 / 331 | FAIL |

### fleet

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 384 | 324 | 12 | 1.4 | 2153 / 206 | PASS |
| zoom-200-720 | COMPACT | 224 | 96 | 12 | 1.4 | 4001 / 80 | FAIL |

### notifications

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 384 | 255.81 | 12 | 1.4 | 256 / 256 | PASS |
| zoom-150 | COMPACT | 160 | 144 | 12 | 1.4 | 597 / 144 | PASS |

### profile

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 416 | 648 | 12 | 1.4 | 6794 / 646 | PASS |
| 1920x1080 | LARGE | 512 | 864 | 12 | 1.4 | 6124 / 862 | PASS |
| zoom-150 | COMPACT | 384 | 432 | 12 | 1.4 | 7277 / 430 | PASS |
| zoom-200 | COMPACT | 384 | 486 | 12 | 1.4 | 7277 / 484 | PASS |
| zoom-200-720 | COMPACT | 192 | 324 | 12 | 1.4 | 32151 / 322 | FAIL |

### city

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 416 | 648 | 12 | 1.4 | 855 / 646 | PASS |
| 1920x1080 | LARGE | 512 | 789.23 | 12 | 1.4 | 787 / 787 | PASS |

### settings

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 416 | 648 | 12 | 1.4 | 880 / 646 | PASS |
| zoom-150 | COMPACT | 384 | 432 | 12 | 1.4 | 1421 / 430 | PASS |
| zoom-200 | COMPACT | 384 | 486 | 12 | 1.4 | 1421 / 484 | PASS |

### camera

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 416 | 648 | 11.52 | 1.4 | 646 / 646 | FAIL |

### kpis

| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1280x720 | STANDARD | 970 | 690 | 11 | 1.4 | 688 / 688 | FAIL |
| 1920x1080 | LARGE | 970 | 778 | 11 | 1.4 | 776 / 776 | FAIL |

## Verificări per scenariu

### hud · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:summary \"Detalii\"","2:select.fleet-panel__filter \"ToateÎn cursăLibereBlocate\"","3:select.fleet-panel__sort \"SlotStareETA\"","4:button.fleet-panel__row \"Taxi #1În cursăA · Conduce AI…\"","5:button.fleet-panel__row \"Taxi #2În cursăA · Conduce AI…\"","6:button.fleet-panel__row \"Taxi #3În cursăA · Conduce AI…\"","7:button.fleet-panel__row \"Taxi #4În cursăA · Conduce AI…\"","8:button.fleet-panel__row \"Taxi #5În cursăM · Conduci · …\"","9:button.fleet-panel__row \"Taxi #6În cursăA · Conduce AI…\"","10:button.fleet-panel__row \"Taxi #7În cursăA · Conduce AI…\"","11:button.fleet-panel__row \"Taxi #8În cursăA · Conduce AI…\"","12:button.fleet-panel__row \"Taxi #9În cursăA · Conduce AI…\"","13:button.fleet-panel__row \"Taxi #10În cursăM · Conduci ·…\"","14:button.fleet-panel__row \"Taxi #11LiberA · Conduce AI-u…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### hud · 1920x1080

- `viewport-mapping`: PASS — viewport 1920×1080 at 100% is laid out as 1920×1080 (LARGE). (`{"region":"LARGE","expectedRegion":"LARGE","effectiveWidthPx":1920,"expectedEffectiveWidthPx":1920,"effectiveHeightPx":1080,"expectedEffectiveHeightPx":1080,"compact":false,"large":true}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":1829,"clientHeight":566,"overflowY":"auto","maxHeight":"684px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #13LiberA · Conduce AI-u…\"","2:button.fleet-panel__row \"Taxi #14LiberA · Conduce AI-u…\"","3:button.fleet-panel__row \"Taxi #15LiberM · Conduci · în…\"","4:button.fleet-panel__row \"Taxi #16LiberA · Conduce AI-u…\"","5:button.fleet-panel__row \"Taxi #17LiberA · Conduce AI-u…\"","6:button.fleet-panel__row \"Taxi #18LiberA · Conduce AI-u…\"","7:button.fleet-panel__row \"Taxi #19LiberA · Conduce AI-u…\"","8:button.fleet-panel__row \"Taxi #20LiberM · Conduci · în…\"","9:button.fleet-panel__row \"Taxi #21BlocatA · Conduce AI-…\"","10:button.fleet-panel__row \"Taxi #22BlocatA · Conduce AI-…\"","11:button.fleet-panel__row \"Taxi #23BlocatA · Conduce AI-…\"","12:button.fleet-panel__row \"Taxi #24BlocatA · Conduce AI-…\"","13:button.fleet-panel__row \"Taxi #25BlocatM · Conduci · î…\"","14:button.fleet-panel__row \"Taxi #26BlocatA · Conduce AI-…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### hud · zoom-150

- `viewport-mapping`: PASS — viewport 1280×720 at 150% is laid out as 853.33×480 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":853,"expectedEffectiveWidthPx":853.33,"effectiveHeightPx":480,"expectedEffectiveHeightPx":480,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #28BlocatA · Conduce AI-…\"","2:button.fleet-panel__row \"Taxi #29BlocatA · Conduce AI-…\"","3:button.fleet-panel__row \"Taxi #30BlocatM · Conduci · î…\"","4:section.learning-notifications \"✓Candidat validat, nepublicat…\"","5:summary \"Detalii\"","6:select.fleet-panel__filter \"ToateÎn cursăLibereBlocate\"","7:select.fleet-panel__sort \"SlotStareETA\"","8:button.fleet-panel__row \"Taxi #1În cursăA · Conduce AI…\"","9:button.fleet-panel__row \"Taxi #2În cursăA · Conduce AI…\"","10:button.fleet-panel__row \"Taxi #3În cursăA · Conduce AI…\"","11:button.fleet-panel__row \"Taxi #4În cursăA · Conduce AI…\"","12:button.fleet-panel__row \"Taxi #5În cursăM · Conduci · …\"","13:button.fleet-panel__row \"Taxi #6În cursăA · Conduce AI…\"","14:button.fleet-panel__row \"Taxi #7În cursăA · Conduce AI…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### hud · zoom-200

- `viewport-mapping`: PASS — viewport 1920×1080 at 200% is laid out as 960×540 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":960,"expectedEffectiveWidthPx":960,"effectiveHeightPx":540,"expectedEffectiveHeightPx":540,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"144px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #9În cursăA · Conduce AI…\"","2:button.fleet-panel__row \"Taxi #10În cursăM · Conduci ·…\"","3:button.fleet-panel__row \"Taxi #11LiberA · Conduce AI-u…\"","4:button.fleet-panel__row \"Taxi #12LiberA · Conduce AI-u…\"","5:button.fleet-panel__row \"Taxi #13LiberA · Conduce AI-u…\"","6:button.fleet-panel__row \"Taxi #14LiberA · Conduce AI-u…\"","7:button.fleet-panel__row \"Taxi #15LiberM · Conduci · în…\"","8:button.fleet-panel__row \"Taxi #16LiberA · Conduce AI-u…\"","9:button.fleet-panel__row \"Taxi #17LiberA · Conduce AI-u…\"","10:button.fleet-panel__row \"Taxi #18LiberA · Conduce AI-u…\"","11:button.fleet-panel__row \"Taxi #19LiberA · Conduce AI-u…\"","12:button.fleet-panel__row \"Taxi #20LiberM · Conduci · în…\"","13:button.fleet-panel__row \"Taxi #21BlocatA · Conduce AI-…\"","14:button.fleet-panel__row \"Taxi #22BlocatA · Conduce AI-…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### hud · zoom-200-720

- `viewport-mapping`: PASS — viewport 1280×720 at 200% is laid out as 640×360 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":640,"expectedEffectiveWidthPx":640,"effectiveHeightPx":360,"expectedEffectiveHeightPx":360,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}}]`)
- `surface-inside-viewport`: FAIL — Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360). (`[{"id":"fleet","rect":{"x":16,"y":380,"width":224,"height":96,"right":240,"bottom":476},"bottomOverflowPx":116},{"id":"notifications","rect":{"x":464,"y":240,"width":160,"height":144,"right":624,"bottom":384},"bottomOverflowPx":24}]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #24BlocatA · Conduce AI-…\"","2:button.fleet-panel__row \"Taxi #25BlocatM · Conduci · î…\"","3:button.fleet-panel__row \"Taxi #26BlocatA · Conduce AI-…\"","4:button.fleet-panel__row \"Taxi #27BlocatA · Conduce AI-…\"","5:button.fleet-panel__row \"Taxi #28BlocatA · Conduce AI-…\"","6:button.fleet-panel__row \"Taxi #29BlocatA · Conduce AI-…\"","7:button.fleet-panel__row \"Taxi #30BlocatM · Conduci · î…\"","8:section.learning-notifications \"✓Candidat validat, nepublicat…\"","9:summary \"Detalii\"","10:select.fleet-panel__filter \"ToateÎn cursăLibereBlocate\"","11:select.fleet-panel__sort \"SlotStareETA\"","12:button.fleet-panel__row \"Taxi #1În cursăA · Conduce AI…\"","13:button.fleet-panel__row \"Taxi #2În cursăA · Conduce AI…\"","14:button.fleet-panel__row \"Taxi #3În cursăA · Conduce AI…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### fleet · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:select.fleet-panel__sort \"SlotStareETA\"","2:button.fleet-panel__row \"Taxi #1În cursăA · Conduce AI…\"","3:button.fleet-panel__row \"Taxi #2În cursăA · Conduce AI…\"","4:button.fleet-panel__row \"Taxi #3În cursăA · Conduce AI…\"","5:button.fleet-panel__row \"Taxi #4În cursăA · Conduce AI…\"","6:button.fleet-panel__row \"Taxi #5În cursăM · Conduci · …\"","7:button.fleet-panel__row \"Taxi #6În cursăA · Conduce AI…\"","8:button.fleet-panel__row \"Taxi #7În cursăA · Conduce AI…\"","9:button.fleet-panel__row \"Taxi #8În cursăA · Conduce AI…\"","10:button.fleet-panel__row \"Taxi #9În cursăA · Conduce AI…\"","11:button.fleet-panel__row \"Taxi #10În cursăM · Conduci ·…\"","12:button.fleet-panel__row \"Taxi #11LiberA · Conduce AI-u…\"","13:button.fleet-panel__row \"Taxi #12LiberA · Conduce AI-u…\"","14:button.fleet-panel__row \"Taxi #13LiberA · Conduce AI-u…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### fleet · zoom-200-720

- `viewport-mapping`: PASS — viewport 1280×720 at 200% is laid out as 640×360 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":640,"expectedEffectiveWidthPx":640,"effectiveHeightPx":360,"expectedEffectiveHeightPx":360,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}}]`)
- `surface-inside-viewport`: FAIL — Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360). (`[{"id":"fleet","rect":{"x":16,"y":380,"width":224,"height":96,"right":240,"bottom":476},"bottomOverflowPx":116},{"id":"notifications","rect":{"x":464,"y":240,"width":160,"height":144,"right":624,"bottom":384},"bottomOverflowPx":24}]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #15LiberM · Conduci · în…\"","2:button.fleet-panel__row \"Taxi #16LiberA · Conduce AI-u…\"","3:button.fleet-panel__row \"Taxi #17LiberA · Conduce AI-u…\"","4:button.fleet-panel__row \"Taxi #18LiberA · Conduce AI-u…\"","5:button.fleet-panel__row \"Taxi #19LiberA · Conduce AI-u…\"","6:button.fleet-panel__row \"Taxi #20LiberM · Conduci · în…\"","7:button.fleet-panel__row \"Taxi #21BlocatA · Conduce AI-…\"","8:button.fleet-panel__row \"Taxi #22BlocatA · Conduce AI-…\"","9:button.fleet-panel__row \"Taxi #23BlocatA · Conduce AI-…\"","10:button.fleet-panel__row \"Taxi #24BlocatA · Conduce AI-…\"","11:button.fleet-panel__row \"Taxi #25BlocatM · Conduci · î…\"","12:button.fleet-panel__row \"Taxi #26BlocatA · Conduce AI-…\"","13:button.fleet-panel__row \"Taxi #27BlocatA · Conduce AI-…\"","14:button.fleet-panel__row \"Taxi #28BlocatA · Conduce AI-…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### notifications · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #30BlocatM · Conduci · î…\"","2:select.fleet-panel__filter \"ToateÎn cursăLibereBlocate\"","3:select.fleet-panel__sort \"SlotStareETA\"","4:button.fleet-panel__row \"Taxi #1În cursăA · Conduce AI…\"","5:button.fleet-panel__row \"Taxi #2În cursăA · Conduce AI…\"","6:button.fleet-panel__row \"Taxi #3În cursăA · Conduce AI…\"","7:button.fleet-panel__row \"Taxi #4În cursăA · Conduce AI…\"","8:button.fleet-panel__row \"Taxi #5În cursăM · Conduci · …\"","9:button.fleet-panel__row \"Taxi #6În cursăA · Conduce AI…\"","10:button.fleet-panel__row \"Taxi #7În cursăA · Conduce AI…\"","11:button.fleet-panel__row \"Taxi #8În cursăA · Conduce AI…\"","12:button.fleet-panel__row \"Taxi #9În cursăA · Conduce AI…\"","13:button.fleet-panel__row \"Taxi #10În cursăM · Conduci ·…\"","14:button.fleet-panel__row \"Taxi #11LiberA · Conduce AI-u…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### notifications · zoom-150

- `viewport-mapping`: PASS — viewport 1280×720 at 150% is laid out as 853.33×480 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":853,"expectedEffectiveWidthPx":853.33,"effectiveHeightPx":480,"expectedEffectiveHeightPx":480,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 36 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 14 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: false. (`{"stops":14,"order":["1:button.fleet-panel__row \"Taxi #13LiberA · Conduce AI-u…\"","2:button.fleet-panel__row \"Taxi #14LiberA · Conduce AI-u…\"","3:button.fleet-panel__row \"Taxi #15LiberM · Conduci · în…\"","4:button.fleet-panel__row \"Taxi #16LiberA · Conduce AI-u…\"","5:button.fleet-panel__row \"Taxi #17LiberA · Conduce AI-u…\"","6:button.fleet-panel__row \"Taxi #18LiberA · Conduce AI-u…\"","7:button.fleet-panel__row \"Taxi #19LiberA · Conduce AI-u…\"","8:button.fleet-panel__row \"Taxi #20LiberM · Conduci · în…\"","9:button.fleet-panel__row \"Taxi #21BlocatA · Conduce AI-…\"","10:button.fleet-panel__row \"Taxi #22BlocatA · Conduce AI-…\"","11:button.fleet-panel__row \"Taxi #23BlocatA · Conduce AI-…\"","12:button.fleet-panel__row \"Taxi #24BlocatA · Conduce AI-…\"","13:button.fleet-panel__row \"Taxi #25BlocatM · Conduci · î…\"","14:button.fleet-panel__row \"Taxi #26BlocatA · Conduce AI-…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":false}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — No modal dialog is in front, so Escape has nothing to close. (`{"trapExpected":false,"escapeReason":"Scenariul nu are un dialog modal de închis.","dialogOpenBefore":false,"dialogOpenAfter":false,"focusRestored":false,"dialogStops":0}`)

### profile · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}},{"id":"profile","scroll":{"scrollHeight":6794,"clientHeight":646,"overflowY":"auto","maxHeight":"648px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 1 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":1,"order":["1:summary \"Checksum și dovezi\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":1}`)

### profile · 1920x1080

- `viewport-mapping`: PASS — viewport 1920×1080 at 100% is laid out as 1920×1080 (LARGE). (`{"region":"LARGE","expectedRegion":"LARGE","effectiveWidthPx":1920,"expectedEffectiveWidthPx":1920,"effectiveHeightPx":1080,"expectedEffectiveHeightPx":1080,"compact":false,"large":true}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":1829,"clientHeight":566,"overflowY":"auto","maxHeight":"684px"}},{"id":"profile","scroll":{"scrollHeight":6124,"clientHeight":862,"overflowY":"auto","maxHeight":"864px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 1 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":1,"order":["1:summary \"Checksum și dovezi\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":1}`)

### profile · zoom-150

- `viewport-mapping`: PASS — viewport 1280×720 at 150% is laid out as 853.33×480 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":853,"expectedEffectiveWidthPx":853.33,"effectiveHeightPx":480,"expectedEffectiveHeightPx":480,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 3 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}},{"id":"profile","scroll":{"scrollHeight":7277,"clientHeight":430,"overflowY":"auto","maxHeight":"432px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 1 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":1,"order":["1:summary \"Checksum și dovezi\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":1}`)

### profile · zoom-200

- `viewport-mapping`: PASS — viewport 1920×1080 at 200% is laid out as 960×540 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":960,"expectedEffectiveWidthPx":960,"effectiveHeightPx":540,"expectedEffectiveHeightPx":540,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 3 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"144px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}},{"id":"profile","scroll":{"scrollHeight":7277,"clientHeight":484,"overflowY":"auto","maxHeight":"486px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 1 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":1,"order":["1:summary \"Checksum și dovezi\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":1}`)

### profile · zoom-200-720

- `viewport-mapping`: PASS — viewport 1280×720 at 200% is laid out as 640×360 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":640,"expectedEffectiveWidthPx":640,"effectiveHeightPx":360,"expectedEffectiveHeightPx":360,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 3 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}},{"id":"profile","scroll":{"scrollHeight":32151,"clientHeight":322,"overflowY":"auto","maxHeight":"324px"}}]`)
- `surface-inside-viewport`: FAIL — Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360). (`[{"id":"fleet","rect":{"x":16,"y":380,"width":224,"height":96,"right":240,"bottom":476},"bottomOverflowPx":116},{"id":"notifications","rect":{"x":464,"y":240,"width":160,"height":144,"right":624,"bottom":384},"bottomOverflowPx":24}]`)
- `tab-order`: PASS — 1 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":1,"order":["1:summary \"Checksum și dovezi\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":1}`)

### city · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 40 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}},{"id":"city","scroll":{"scrollHeight":855,"clientHeight":646,"overflowY":"auto","maxHeight":"648px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 4 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":4,"order":["1:button.city-dashboard__incident-row \"ÎncălcareSever · tick 200 · t…\"","2:button.city-dashboard__incident-row \"BlocajMinor · tick 120 · taxi…\"","3:button.city-dashboard__incident-row \"ColiziuneModerat · tick 40 · …\"","4:button.city-dashboard__incident-row \"ConfortMinor · tick 260 · tax…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":4}`)

### city · 1920x1080

- `viewport-mapping`: PASS — viewport 1920×1080 at 100% is laid out as 1920×1080 (LARGE). (`{"region":"LARGE","expectedRegion":"LARGE","effectiveWidthPx":1920,"expectedEffectiveWidthPx":1920,"effectiveHeightPx":1080,"expectedEffectiveHeightPx":1080,"compact":false,"large":true}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 40 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":1829,"clientHeight":566,"overflowY":"auto","maxHeight":"684px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 4 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":4,"order":["1:button.city-dashboard__incident-row \"ÎncălcareSever · tick 200 · t…\"","2:button.city-dashboard__incident-row \"BlocajMinor · tick 120 · taxi…\"","3:button.city-dashboard__incident-row \"ColiziuneModerat · tick 40 · …\"","4:button.city-dashboard__incident-row \"ConfortMinor · tick 260 · tax…\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":4}`)

### settings · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.fleet-panel__caption \"Filtru\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 53 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 2 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}},{"id":"settings","scroll":{"scrollHeight":880,"clientHeight":646,"overflowY":"auto","maxHeight":"648px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 3 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":3,"order":["1:select.game-settings__select \"metri (m)picioare (ft)\"","2:select.game-settings__select \"Din spateFirst-person din poz…\"","3:input.game-settings__range"],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":3}`)

### settings · zoom-150

- `viewport-mapping`: PASS — viewport 1280×720 at 150% is laid out as 853.33×480 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":853,"expectedEffectiveWidthPx":853.33,"effectiveHeightPx":480,"expectedEffectiveHeightPx":480,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 53 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 3 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"96px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}},{"id":"settings","scroll":{"scrollHeight":1421,"clientHeight":430,"overflowY":"auto","maxHeight":"432px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 3 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":3,"order":["1:select.game-settings__select \"metri (m)picioare (ft)\"","2:select.game-settings__select \"Din spateFirst-person din poz…\"","3:input.game-settings__range"],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":3}`)

### settings · zoom-200

- `viewport-mapping`: PASS — viewport 1920×1080 at 200% is laid out as 960×540 (COMPACT). (`{"region":"COMPACT","expectedRegion":"COMPACT","effectiveWidthPx":960,"expectedEffectiveWidthPx":960,"effectiveHeightPx":540,"expectedEffectiveHeightPx":540,"compact":true,"large":false}`)
- `text-legible`: PASS — smallest visible text is 12 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":12,"minFontDescriptor":"span.minimap__route \"Rută: 2 benzi · 25% · 120 m\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 53 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 3 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":4001,"clientHeight":80,"overflowY":"auto","maxHeight":"144px"}},{"id":"notifications","scroll":{"scrollHeight":597,"clientHeight":144,"overflowY":"auto","maxHeight":"144px"}},{"id":"settings","scroll":{"scrollHeight":1421,"clientHeight":484,"overflowY":"auto","maxHeight":"486px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 3 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":3,"order":["1:select.game-settings__select \"metri (m)picioare (ft)\"","2:select.game-settings__select \"Din spateFirst-person din poz…\"","3:input.game-settings__range"],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":3}`)

### camera · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: FAIL — smallest visible text is 11.52 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":11.52,"minFontDescriptor":"span \"Lină\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: PASS — No visible text is clipped horizontally. (`[]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 52 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 4 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":4,"order":["1:button.control-sliders__preset \"Accesibil\"","2:button.control-sliders__preset \"Echilibrat\"","3:button.control-sliders__preset \"Direct\"","4:input.control-sliders__range"],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":4}`)

### kpis · 1280x720

- `viewport-mapping`: PASS — viewport 1280×720 at 100% is laid out as 1280×720 (STANDARD). (`{"region":"STANDARD","expectedRegion":"STANDARD","effectiveWidthPx":1280,"expectedEffectiveWidthPx":1280,"effectiveHeightPx":720,"expectedEffectiveHeightPx":720,"compact":false,"large":false}`)
- `text-legible`: FAIL — smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":11,"minFontDescriptor":"span.kpi-history__chart-group-label \"Luna 0\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: FAIL — 4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri". (`[{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"},{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"},{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"},{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"}]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":2153,"clientHeight":206,"overflowY":"auto","maxHeight":"324px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 2 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":2,"order":["1:div.kpi-history__body \"12 luni (11 cu date, 1 fără d…\"","2:button.kpi-history__close \"Închide\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":2}`)

### kpis · 1920x1080

- `viewport-mapping`: PASS — viewport 1920×1080 at 100% is laid out as 1920×1080 (LARGE). (`{"region":"LARGE","expectedRegion":"LARGE","effectiveWidthPx":1920,"expectedEffectiveWidthPx":1920,"effectiveHeightPx":1080,"expectedEffectiveHeightPx":1080,"compact":false,"large":true}`)
- `text-legible`: FAIL — smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4. (`{"minFontPx":11,"minFontDescriptor":"span.kpi-history__chart-group-label \"Luna 0\"","minLineHeightRatio":1.4,"minLineHeightDescriptor":"span \"Viteză\""}`)
- `text-not-clipped`: FAIL — 4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri". (`[{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"},{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"},{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"},{"surface":"kpis","descriptor":"span.kpi-history__chart-group-value \"fără review-uri\"","text":"fără review-uri","scrollWidth":36,"clientWidth":14,"overflowX":"visible"}]`)
- `text-not-overlapping`: PASS — No two text boxes in the same row overlap. (`[]`)
- `contrast-aa`: PASS — Every measured text pair reaches the WCAG AA ratio for its size. (`[]`)
- `controls-visible`: PASS — 37 controls have a non-zero rectangle. (`[]`)
- `controls-hit-testable`: PASS — Every enabled control inside the viewport wins its own centre hit-test. (`[]`)
- `essentials-visible`: PASS — 2 essential controls mounted by the harness are visible. (`{"missing":[],"outsideHarness":["mode-buttons: Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.","pause-control: Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.","recovery-control: Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii)."]}`)
- `no-critical-overlap`: PASS — No two measured surfaces overlap. (`[]`)
- `scroll-policy`: PASS — 1 overflowing surfaces scroll vertically with `overflow-y: auto`. (`[{"id":"fleet","scroll":{"scrollHeight":1829,"clientHeight":566,"overflowY":"auto","maxHeight":"684px"}}]`)
- `surface-inside-viewport`: PASS — Every visible surface stays inside the viewport. (`[]`)
- `tab-order`: PASS — 2 tab stops, 0 duplicates, 0 escapes from the open panel, dialog open before: true. (`{"stops":2,"order":["1:div.kpi-history__body \"12 luni (11 cu date, 1 fără d…\"","2:button.kpi-history__close \"Închide\""],"duplicates":[],"outsideDialog":[],"dialogOpenBefore":true}`)
- `focus-visible`: PASS — Every keyboard stop draws a visible focus ring of at least 3 px. (`[]`)
- `escape-closes`: PASS — Escape closed the dialog: true; focus restored: true. (`{"trapExpected":true,"escapeReason":null,"dialogOpenBefore":true,"dialogOpenAfter":false,"focusRestored":true,"dialogStops":2}`)

## Findings

### D1 · hud · zoom-200-720 (STRESS, MEDIUM)

A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-hud-zoom-200-720.png.
3. Viewport 1280×720 la 200% zoom (640×360 CSS px efectivi).
4. Scenariul „hud”, verificarea `surface-inside-viewport`: Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).

### D2 · fleet · zoom-200-720 (STRESS, MEDIUM)

A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-fleet-zoom-200-720.png.
3. Viewport 1280×720 la 200% zoom (640×360 CSS px efectivi).
4. Scenariul „fleet”, verificarea `surface-inside-viewport`: Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).

### D3 · profile · zoom-200-720 (STRESS, MEDIUM)

A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-profile-zoom-200-720.png.
3. Viewport 1280×720 la 200% zoom (640×360 CSS px efectivi).
4. Scenariul „profile”, verificarea `surface-inside-viewport`: Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).

### D4 · camera · 1280x720 (CONTRACT, MEDIUM)

Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11.52 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-camera-1280x720.png.
3. Viewport 1280×720 la 100% zoom (1280×720 CSS px efectivi).
4. Scenariul „camera”, verificarea `text-legible`: smallest visible text is 11.52 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.

### D5 · kpis · 1280x720 (CONTRACT, MEDIUM)

Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-kpis-1280x720.png.
3. Viewport 1280×720 la 100% zoom (1280×720 CSS px efectivi).
4. Scenariul „kpis”, verificarea `text-legible`: smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.

### D6 · kpis · 1280x720 (CONTRACT, MEDIUM)

Visible text overflows or is clipped by its own box. (4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-kpis-1280x720.png.
3. Viewport 1280×720 la 100% zoom (1280×720 CSS px efectivi).
4. Scenariul „kpis”, verificarea `text-not-clipped`: 4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".

### D7 · kpis · 1920x1080 (CONTRACT, MEDIUM)

Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-kpis-1920x1080.png.
3. Viewport 1920×1080 la 100% zoom (1920×1080 CSS px efectivi).
4. Scenariul „kpis”, verificarea `text-legible`: smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.

### D8 · kpis · 1920x1080 (CONTRACT, MEDIUM)

Visible text overflows or is clipped by its own box. (4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".)

Pași de reproducere:

1. npm run qa:ui -- --browser
2. Deschide captura Docs/Evidence/153-ui-qa/capture-kpis-1920x1080.png.
3. Viewport 1920×1080 la 100% zoom (1920×1080 CSS px efectivi).
4. Scenariul „kpis”, verificarea `text-not-clipped`: 4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".
