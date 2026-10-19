import base from '../../../../eslint.config.js';
export default base.map(c => c.files?.includes('scripts/**/*.mjs') ? {...c,files:['tests/browser/wheel-dynamics-v2/**/*.mjs']} : c.files?.includes('tests/**/*.ts') ? {...c,files:['tests/browser/wheel-dynamics-v2/**/*.ts','tests/browser/wheel-dynamics-v2/**/*.d.mts']} : c);
