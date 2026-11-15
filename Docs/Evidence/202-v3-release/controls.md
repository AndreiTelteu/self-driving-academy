# Controalele reale ale release-ului V3 (PBI 202)

> Fișier generat determinist de `npm run release:v3`. Nu edita manual.

**Verdict: PASS.** Tastele sunt citite din bindingurile 009, iar consumatorii din adaptoarele 066/067/030. Un binding declarat fără listener este marcat `DECLARED_ONLY`; niciun control nu este inventat.

## Tastatură (009 + 080)

| Acțiune | Tastă | Vehicul | Personaj | Consumator | Stare | Remapabil |
| --- | --- | --- | --- | --- | --- | --- |
| `throttle` | `KeyW` | throttle 024 (sursa PLAYER) | mers înainte, intensitate 1 | `066` | CONSUMED | DA |
| `brake` | `KeyS` | brake 024 | oprește (walker-ul nu merge înapoi) | `066` | CONSUMED | DA |
| `steerLeft` | `KeyA` | steering −1 | schimbă direcția −π/2 | `066` | CONSUMED | DA |
| `steerRight` | `KeyD` | steering +1 | schimbă direcția +π/2 | `066` | CONSUMED | DA |
| `handbrake` | `Space` | handbrake 024 | ignorat de proiecția 193 | `066` | CONSUMED | DA |
| `manualMode` | `KeyM` | 067 intenție MANUAL | nu se aplică | `067` | CONSUMED | DA |
| `learningMode` | `KeyL` | 067 intenție LEARNING | nu se aplică | `067` | CONSUMED | DA |
| `kpis` | `KeyK` | UI 210, buton | nu se aplică | — | DECLARED_ONLY | DA |
| `fleet` | `Tab` | UI 075, buton | nu se aplică | — | DECLARED_ONLY | DA |
| `signalLeft` | `KeyQ` | turnSignal LEFT | ignorat | `066` | CONSUMED | DA |
| `signalRight` | `KeyE` | turnSignal RIGHT | ignorat | `066` | CONSUMED | DA |
| `camera` | `KeyC` | 017 are toggle separat, implicit KeyC (nu citește bindingul 009) | nu se aplică | — | DECLARED_ONLY | DA |
| `profile` | `KeyP` | UI 077, buton | nu se aplică | — | DECLARED_ONLY | DA |
| `pause` | `Escape` | UI 012, buton | nu se aplică | — | DECLARED_ONLY | DA |
| `recover` | `KeyR` | 030 | nu se aplică | `030` | CONSUMED | DA |

**10 acțiuni au consumator real**, iar **5 sunt declarate fără listener**: `kpis`, `fleet`, `camera`, `profile`, `pause`. Toate cele 15 acțiuni sunt remapabile prin 080, cu aceeași gramatică de coduri.

Starea `DECLARED_ONLY` se referă strict la bindingul de tastatură: `kpis`, `fleet`, `profile` și `pause` au butoane în UI, iar camera are un toggle separat în adaptorul de renderer (implicit `KeyC`), care nu citește bindingul 009. Remaparea unei astfel de taste schimbă settings-ul, nu și adaptorul separat.

## Alergare și mers

Mersul folosește aceleași taste de condus prin proiecția 193: accelerația comandă mersul înainte, frâna oprește (walker-ul 192 nu merge înapoi), iar virarea schimbă direcția cu ±π/2. Alergarea cere acțiunea `sprint`, care **nu are binding 009**: este un canal de contract, nu un control live.

## Pointer

| Gest | Efect | Stare | Dovadă |
| --- | --- | --- | --- |
| Clic stânga pe un vehicul din canvas | Emite intenția 068 de selecție (sursa WORLD); un drag peste 5 px anulează selecția. | IMPLEMENTED | `src/rendering/babylon/vehicle-picking-input.ts` |
| Clic pe un rând din lista flotei (Tab deschide/focus panoul) | Rândul este un buton cu rol de opțiune; clicul emite doar intenția de selecție, fără listener global de tastatură. | IMPLEMENTED | `src/ui/fleet-panel.ts` |
| Butonul de captură al camerei, apoi mișcarea mouse-ului | Pointer lock pe canvas; mișcarea relativă alimentează camera; Escape eliberează captura; butonul de recentrare readuce camera. | IMPLEMENTED | `src/rendering/babylon/vehicle-camera-input.ts` |
| Tab / Shift+Tab în panoul deschis, Escape pentru închidere | Focusul este prins în panou, iar Escape este predat portului de închidere al gazdei. | IMPLEMENTED | `src/ui/panel-focus.ts` |
| Orbită de cameră third person cu mouse-ul | Nu există: camera 194 primește orbită doar ca intenție explicită, iar build-ul nu are un binding de mouse pentru personaj. | NOT_AVAILABLE | `src/character/character-camera.ts` |

## Focus și remapare

- Tastele sunt ignorate în câmpuri de text, `contenteditable`, butoane, link-uri și dialoguri modale, iar focusul pierdut golește comenzile (066/070).
- 067 validează toate cele 15 coduri, dar le transformă în intenții doar pe `manualMode` și `learningMode`; celelalte taste sunt păstrate pentru UI și remapare.
- 080 acceptă numai coduri `KeyboardEvent.code` din gramatica închisă și refuză duplicatele; schimbarea se aplică prin `SettingsStore.replace`.
- Camera vehiculului capturează pointerul numai la un gest explicit pe buton; Escape eliberează captura. Camera personajului 194 nu are binding de mouse.

## Verificările controalelor

| Verificare | Rezultat | Detaliu |
| --- | --- | --- |
| `bindings-count` | PASS | 15 acțiuni 009, 15 coduri unice |
| `drive-actions` | PASS | 7 acțiuni de condus consumate de adaptorul 066 |
| `mode-actions` | PASS | M și L sunt singurele taste mapate de adaptorul 067 |
| `sprint-not-bound` | PASS | alergarea există în vocabularul 193, dar nu are binding 009: este contract, nu control live |
| `remap-coverage` | PASS | 15/15 acțiuni remapare prin 080 |
| `pointer-inventory` | PASS | 4 gesturi implementate, 1 declarate indisponibile |

## Comenzi

```bash
npm run release:v3
npm run release:v3 -- --check
```
