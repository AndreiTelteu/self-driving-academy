# Exact measured PBI022 source closure

The52 inputs from build-manifest.json were copied byte-exact before PBI023 changed vehicle mechanics, after PBI022 full protocols and publication89ab82d. Original sourceHash40c307245299faed0f40636791974b7a52af94253978a4271131001132382a7e and raw reports remain unchanged. Use node scripts/verify-physics-adapter-evidence.mjs --historical to explicitly validate this archive and original artifact bytes; default mode still rejects changed current source. Historical mode writes a separate historical-summary.json.
