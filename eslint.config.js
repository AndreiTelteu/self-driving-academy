import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import globals from 'globals';

// Babel parses TS syntax without depending on the application's TS compiler version.
const projectRules = {
  rules: {
    'no-explicit-any': {
      meta: {
        type: 'problem',
        schema: [],
        messages: { unknown: 'Use unknown and validate external data instead of explicit any.' },
      },
      create(context) {
        return {
          TSAnyKeyword(node) {
            context.report({ node, messageId: 'unknown' });
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.worktrees/**',
      'Docs/**',
      'PBI/**',
      '.pbi-validation-*/**',
      '.camera-preview017/**',
      '.vite-camera017/**',
      '.playwright-cli/**',
      'output/playwright/**',
    ],
  },
  {
    files: ['scripts/**/*.mjs', '*.js'],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: babelParser,
      globals: globals.browser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript'] },
        },
      },
    },
    plugins: { project: projectRules },
    rules: {
      // Scope/type diagnostics belong to tsc; JS rules can misread TS declarations.
      'project/no-explicit-any': 'error',
      'no-debugger': 'error',
      'no-constant-condition': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
