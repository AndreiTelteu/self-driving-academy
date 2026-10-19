import base from '../../../../eslint.config.js';
import js from '@eslint/js';
import globals from 'globals';
export default [...base, { ...base.at(-1), files: ['tests/browser/wheel-dynamics-v2/**/*.mts'] }, {
  files: ['tests/browser/wheel-dynamics-v2/**/*.mjs'],
  ...js.configs.recommended,
  languageOptions: { globals: globals.node },
}];
