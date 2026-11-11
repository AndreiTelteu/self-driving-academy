# Raport 213 — XP din misiuni și timp activ

Determinist, fără ceas de perete și fără browser. Contract: `213-player-progress-v1`, reguli
`213-xp-rules-v1`, praguri `213-xp-levels-v1`. Politica: 1
XP/minut activ, prag AFK 120000 ms, fereastră de observare maximum
30000 ms, gol neobservat maximum 30000 ms.

## Rezumat

- verificări: **29/29**, eșecuri 0, overall PASS;
- misiune 125: 100 XP acordat din 100 autorat, duplicat 0 XP, replay 0 XP, sold 100;
- daily 211: 100 XP acordat, duplicat 0 XP, sold 100;
- timp activ: 160000 ms creditați = 2.666666 XP (2666666 micro-XP), sumă verificabilă 2666666;
- determinism: 2 rulări, egale true.

## Misiunea și zilele

Misiunea `campaign-1-first-taxi` este finalizată de trackerul 116 și decontată de ledgerul 125.
XP-ul este cheia 125 a recompensei (`causeId = rewardId`), deci o livrare repetată și un replay real
116 raportează 0 XP. Sold după cele două livrări: 100 XP, nivel 2,
1 intrări în istoric.

Ziua 2026-11-11 (`daily-v1:player:213-xp:2026-11-11:s1:daily-service-window@1`) acordă 100 XP prin
`dailyRewardId`; a doua livrare a aceleiași recompense acordă 0 XP.

## Timpul activ

10 ferestre creditate (160000 ms). Fracțiile se păstrează:
2666666 micro-XP este exact `activeTimeMicroXp(160000)`
= 2666666, iar jumătate de minut este 0.5 XP.

| Motiv | Ferestre |
| --- | --- |
| PAUSED | 1 |
| NOT_FOCUSED | 1 |
| BACKGROUND | 1 |
| AFK | 1 |
| OUTSIDE_ACADEMY | 3 |
| WINDOW_TOO_LONG | 1 |

Gol offline de 3570000 ms necreditat (1 goluri,
3570000 ms neobservați în total); fereastră prea lungă refuzată cu
`WINDOW_TOO_LONG`. AUTO a contat: 0.5 XP, pentru că fereastra
cere focus, vizibilitate, fără pauză și fără AFK.

## Monotonia și separarea de profil

- sold 200.5 → 200.5, nivel
  2 → 2;
- KPI 209: 1 cursă eșuată, venit 0,
  rating 1; settlement de misiune eșuată refuzat:
  true; recompensă refuzată:
  0 XP; zi ratată: FORWARD_JUMP
  (1 zi), credit valid ulterior:
  true;
- reset/import de stil: 100500000 → 100500000
  micro-XP, 1 versiune 109 după import, nivel
  2 → 2.

## Istoricul și checkpointul

3 intrări, sold 200500000 micro-XP, suma intrărilor
200500000; fiecare intrare explicată: true;
checkpoint fără sold/nivel: true; checkpoint falsificat refuzat:
true.

## Verificări

| Rezultat | Verificare | Detaliu |
| --- | --- | --- |
| PASS | contract version and policy are the published 213 ones | 213-player-progress-v1; debits 0; credite negative interzise |
| PASS | level thresholds are monotone and derived from the balance | nivel 2 = 100 XP, nivel 3 = 300 XP, nivel 50 = 122.500 XP |
| PASS | active time accrual is exact to the micro-XP | 30 s = 500.000 micro-XP, 70 s = 1.166.666 micro-XP, 1 ms = 16 micro-XP |
| PASS | a real 125 settlement pays the authored XP once | GRANTED: 100 XP acordat din 100 autorat |
| PASS | mission XP uses the 125 reward identity and the 213 entry identity | causeId = rewardId 125, entryId = xpEntryId(player, MISSION_REWARD, rewardId) |
| PASS | a repeated delivery of the same completion pays nothing | 0 XP, sold 100 |
| PASS | a real 116 replay is a new completion with zero XP | finalizare nouă, 0 XP |
| PASS | a real 211 daily reward pays once | 100 XP, identitate 211 respectată |
| PASS | a duplicate 211 reward pays nothing | 0 XP, sold 100 |
| PASS | fractions of a minute are preserved, not rounded | 160000 ms = 2666666 micro-XP = 2.666666 XP |
| PASS | half a minute is exactly half an XP | 500000 micro-XP = 0.5 XP |
| PASS | window excluded: PAUSED | 1 fereastră/e, 0 XP |
| PASS | window excluded: NOT_FOCUSED | 1 fereastră/e, 0 XP |
| PASS | window excluded: BACKGROUND | 1 fereastră/e, 0 XP |
| PASS | window excluded: AFK | 1 fereastră/e, 0 XP |
| PASS | window excluded: OUTSIDE_ACADEMY | 3 fereastră/e, 0 XP |
| PASS | an offline gap is never credited | gol 3570000 ms neobservat, creditat doar 30000 ms |
| PASS | a window longer than the calibration is refused | 3600000 ms refuzați, 0 XP |
| PASS | AUTO counts while the player observes the Academy | AUTO creditat 0.5 XP cu focus, vizibilitate, fără pauză și fără AFK |
| PASS | the history is the balance: every entry carries its source, moment, identity and amount | 3 intrări, suma 200500000 micro-XP |
| PASS | a checkpoint stores proofs, not XP, and refuses a forged balance | fără xpBalance/level în checkpoint; sold falsificat refuzat |
| PASS | revenue, ratings and KPI facts cannot lower the balance | KPI: 1 cursă eșuată, venit 0, rating 1; sold 200500000 |
| PASS | an incident, a failed mission and a refused reward cannot lower the balance | instanță 116 FAILED fără settlement; recompensă refuzată 0 XP |
| PASS | a missed day grants no offline XP and keeps the balance | FORWARD_JUMP, 1 zi sărită, sold neschimbat |
| PASS | the level never falls on any of those paths | nivel 2 → 2 |
| PASS | the only movement is upward: a valid credit after them adds XP | 0.5 XP adăugat după toate căile fără XP |
| PASS | a reload never pays the same period twice | direct 1000000 = reload 1000000 micro-XP |
| PASS | a reset or an import of the driving style never resets XP | sold 100500000 micro-XP păstrat, 1 versiune 109 importată |
| PASS | the level is derived from the balance only | sold 0, nivel 1, prag 0 |
