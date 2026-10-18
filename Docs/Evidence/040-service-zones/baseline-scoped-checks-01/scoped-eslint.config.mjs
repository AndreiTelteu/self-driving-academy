import project from '../../../../eslint.config.js';
import js from '@eslint/js';
import globals from 'globals';
export default [...project,{
  files:['tests/browser/service-zones-before.mjs','tests/browser/service-zones/**/*.mjs','tests/world/service-zones-reference.test.mjs'],
  ...js.configs.recommended,
  languageOptions:{globals:globals.node},
}];
