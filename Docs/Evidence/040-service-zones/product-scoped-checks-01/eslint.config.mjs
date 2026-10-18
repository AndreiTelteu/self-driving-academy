import project from '../../../../eslint.config.js';
import js from '@eslint/js';
import globals from 'globals';
export default [...project,{files:["tests/browser/service-zones-after.mjs","tests/browser/service-zones/after-proof.mjs","tests/browser/service-zones/verify-after.mjs","tests/world/service-zones-after-proof.test.mjs"],...js.configs.recommended,languageOptions:{globals:globals.node}}];
