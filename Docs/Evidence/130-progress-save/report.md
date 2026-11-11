# 130 Raport de salvare a progresului

Transcript: [report.json](report.json). Generat de `npm run save:progress`;
transcriptul nu conține timp de perete și este determinist.

Versiune: `130-progress-save-report-v1`.

Regula de verificare: Reîncărcarea este dovedită prin ciclu complet: trackerul este restaurat prin restore-ul real 116, jurnalul de campanie este reluat într-un ledger 125 proaspăt și comparat digest cu digest, iar aceeași finalizare este livrată din nou ledgerului restaurat. Izolarea unui reset de categorie este dovedită prin compararea celorlalte categorii byte cu byte.

## Reîncărcare completă

| Câmp | Valoare |
| --- | --- |
| Categorii restaurate | {"settings":true,"campaign":true,"progress":true} |
| Instanțe înainte/după | 4/4 |
| Finalizate înainte/după | 3/3 |
| Active înainte/după | 1/1 |
| XP înainte/după | 300/300 |
| Deblocări înainte/după | 3/3 |
| Recompense acordate înainte/după | 6/6 |
| Remapări restaurate | KeyI/ArrowDown/KeyV |
| Preferințe restaurate | mph/HIGH/audio:true/fov:92 |
| Fapte de tracker identice | true |
| Sursa setărilor | STORED |
| Rânduri de progres | 2 |

## Recompensa unică după reîncărcare

| Câmp | Valoare |
| --- | --- |
| Aceeași finalizare | DUPLICATE |
| XP plătit | 0 |
| Motive | ["COMPLETION_ALREADY_SETTLED"] |
| XP înainte/după duplicat | 300/300 |
| Recompense înainte/după duplicat | 6/6 |
| Reluare reală | NO_REWARD |
| XP plătit la reluare | 0 |
| Motive la reluare | ["REWARD_ALREADY_GRANTED"] |
| XP după reluare | 300 |
| Finalizări în ledger | 4 |

## Reset de setări

| Câmp | Valoare |
| --- | --- |
| Progres șters | false |
| Campanie ștearsă | false |
| Progres păstrat | true |
| Campanie păstrată | true |
| Setări schimbate | true |
| Setări după reset | DEFAULTS |
| Remapări/unități/calitate | KeyW/km/h/MEDIUM |
| Digest progres păstrat | true |
| Digest campanie păstrat | true |
| Finalizări de campanie păstrate | 3 |
| Reset supraviețuiește reîncărcării | true |

## Reset de campanie

| Câmp | Valoare |
| --- | --- |
| Campanie ștearsă | true |
| Progres șters | false |
| Progres păstrat | true |
| Setări păstrate | true |
| Campanie după reset | ABSENT |
| Digest progres păstrat | true |
| Setări identice | true |
| Finalizări rămase | 0 |

## Reset de progres

| Câmp | Valoare |
| --- | --- |
| Progres șters | true |
| Campanie ștearsă | false |
| Campanie păstrată | true |
| Setări păstrate | true |
| Progres după reset | ABSENT |
| Digest campanie păstrat | true |
| Instanțe restaurate | 0 |

## Scriere eșuată la mijloc

| Câmp | Valoare |
| --- | --- |
| Status | REJECTED |
| Cod | TRANSACTION_ABORTED |
| Rânduri înainte/după | 2/2 |
| Amprentă identică | true |
| Revizii identice | true |

## Valori implicite fără setări stocate

| Câmp | Valoare |
| --- | --- |
| Sursa setărilor | DEFAULTS |
| Sesiune goală | true |
| Remapări | KeyW/KeyS |
| Unități | km/h/m |
| Calitate | MEDIUM |
| Audio mut | false |

## Refuzuri închise

| Câmp | Valoare |
| --- | --- |
| Campanie modificată | LEDGER_REPLAY_MISMATCH |
| Progres modificat | SAVE_DIGEST_MISMATCH |
| Alt catalog | CATALOG_MISMATCH |
| Salvare goală | SAVE_EMPTY |
| Categorie necunoscută | SAVE_CATEGORY_UNKNOWN |
| Fără lock de scriitor | WRITER_REQUIRED |

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
| reload.categories | {"settings":true,"campaign":true,"progress":true} | {"settings":true,"campaign":true,"progress":true} | PASS | All three categories read back. |
| reload.instances | 4 | 4 | PASS | Instances restored. |
| reload.completed | 3 | 3 | PASS | Completions restored. |
| reload.active | 1 | 1 | PASS | The ACTIVE mission stays active. |
| reload.xp | 300 | 300 | PASS | XP total identical after reload. |
| reload.unlocks | 3 | 3 | PASS | Unlock count identical. |
| reload.rewards | 6 | 6 | PASS | Granted rewards identical. |
| reload.settings | true | true | PASS | Every preference restored exactly. |
| reload.remaps | KeyI/ArrowDown/KeyV | KeyI/ArrowDown/KeyV | PASS | Keyboard remaps restored. |
| reload.preferences | mph/HIGH/audio:true/fov:92 | mph/HIGH/audio:true/fov:92 | PASS | Units, quality, audio and FOV restored. |
| reload.trackerFacts | true | true | PASS | Objectives, verdicts, versions and reasons identical. |
| reload.trackerDigest | true | true | PASS | Stored tracker digest equals the replayed one. |
| reload.campaignDigest | true | true | PASS | Campaign replay digest equals the live ledger. |
| reload.trackerRow | ACTIVE | ACTIVE | PASS | Tracker row lifecycle status. |
| reload.rows | 2 | 2 | PASS | Two progress rows: one tracker, one campaign. |
| reload.settingsSource | STORED | STORED | PASS | Settings come from the stored row. |
| reward.repeatStatus | DUPLICATE | DUPLICATE | PASS | The same completion is a duplicate. |
| reward.repeatXp | 0 | 0 | PASS | A duplicate pays no XP. |
| reward.repeatReasons | ["COMPLETION_ALREADY_SETTLED"] | ["COMPLETION_ALREADY_SETTLED"] | PASS | Closed duplicate reason. |
| reward.xpAfterRepeat | 300 | 300 | PASS | XP unchanged by the duplicate. |
| reward.grantsAfterRepeat | 6 | 6 | PASS | Grant count unchanged. |
| reward.replayStatus | NO_REWARD | NO_REWARD | PASS | A new attempt pays nothing. |
| reward.replayXp | 0 | 0 | PASS | Reward identity already granted. |
| reward.replayReasons | ["REWARD_ALREADY_GRANTED"] | ["REWARD_ALREADY_GRANTED"] | PASS | Closed replay reason. |
| reward.xpAfterReplay | 300 | 300 | PASS | XP unchanged by the replay. |
| reward.completions | 4 | 4 | PASS | Three completions plus the replayed attempt. |
| resetSettings.deletedTracker | false | false | PASS | Mission progress untouched. |
| resetSettings.deletedCampaign | false | false | PASS | Campaign untouched. |
| resetSettings.keptTracker | true | true | PASS | Tracker row still stored. |
| resetSettings.keptCampaign | true | true | PASS | Campaign row still stored. |
| resetSettings.changed | true | true | PASS | The reset really changed the settings. |
| resetSettings.values | DEFAULTS | DEFAULTS | PASS | Documented 009 defaults restored. |
| resetSettings.bindings | KeyW/km/h/MEDIUM | KeyW/km/h/MEDIUM | PASS | Defaults for remaps, units and quality. |
| resetSettings.trackerDigest | true | true | PASS | Tracker digest unchanged. |
| resetSettings.campaignDigest | true | true | PASS | Campaign digest unchanged. |
| resetSettings.completed | 3 | 3 | PASS | Campaign keeps three completions. |
| resetSettings.reload | true | true | PASS | The reset survives a reload. |
| resetCampaign.deletedCampaign | true | true | PASS | Only the campaign row is deleted. |
| resetCampaign.deletedTracker | false | false | PASS | Mission progress untouched. |
| resetCampaign.keptTracker | true | true | PASS | Tracker row still stored. |
| resetCampaign.keptSettings | true | true | PASS | Settings row still stored. |
| resetCampaign.campaignAfter | ABSENT | ABSENT | PASS | No campaign row after the reset. |
| resetCampaign.trackerDigest | true | true | PASS | Tracker digest unchanged. |
| resetCampaign.settingsKept | true | true | PASS | Settings identical. |
| resetCampaign.completed | 0 | 0 | PASS | No campaign completions remain. |
| resetProgress.deletedTracker | true | true | PASS | Only the tracker row is deleted. |
| resetProgress.deletedCampaign | false | false | PASS | Campaign untouched. |
| resetProgress.keptCampaign | true | true | PASS | Campaign row still stored. |
| resetProgress.keptSettings | true | true | PASS | Settings row still stored. |
| resetProgress.trackerAfter | ABSENT | ABSENT | PASS | No tracker row after the reset. |
| resetProgress.campaignDigest | true | true | PASS | Campaign digest unchanged. |
| resetProgress.settingsKept | true | true | PASS | Settings identical. |
| resetProgress.restored | 0 | 0 | PASS | A reset progress opens an empty tracker. |
| failedWrite.status | REJECTED | REJECTED | PASS | The write is reported as rejected. |
| failedWrite.code | TRANSACTION_ABORTED | TRANSACTION_ABORTED | PASS | The transaction aborted. |
| failedWrite.rows | 2 | 2 | PASS | No row was added. |
| failedWrite.fingerprint | true | true | PASS | Stored rows byte-identical. |
| failedWrite.revisions | true | true | PASS | Revisions did not move. |
| defaults.source | DEFAULTS | DEFAULTS | PASS | No stored row means defaults. |
| defaults.empty | true | true | PASS | An untouched session is empty. |
| defaults.bindings | KeyW/KeyS | KeyW/KeyS | PASS | Default remaps. |
| defaults.units | km/h/m | km/h/m | PASS | Default units. |
| defaults.quality | MEDIUM | MEDIUM | PASS | Default quality preset. |
| defaults.audio | false | false | PASS | Default audio is not muted. |
| refusal.tamperedCampaign | LEDGER_REPLAY_MISMATCH | LEDGER_REPLAY_MISMATCH | PASS | A tampered campaign digest is refused. |
| refusal.tamperedTracker | SAVE_DIGEST_MISMATCH | SAVE_DIGEST_MISMATCH | PASS | A tampered tracker digest is refused. |
| refusal.otherCatalog | CATALOG_MISMATCH | CATALOG_MISMATCH | PASS | Another catalog cannot read the ledger. |
| refusal.emptySave | SAVE_EMPTY | SAVE_EMPTY | PASS | A save without a category is refused. |
| refusal.unknownReset | SAVE_CATEGORY_UNKNOWN | SAVE_CATEGORY_UNKNOWN | PASS | An unknown reset category is refused. |
| refusal.writerRequired | WRITER_REQUIRED | WRITER_REQUIRED | PASS | A page without the writer lock cannot save. |

## Sumar

- Verificări: 70/70
- Scenarii: 8
- General: PASS
