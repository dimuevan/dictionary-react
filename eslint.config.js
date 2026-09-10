import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Create React App ran ESLint on every build, and CI=true turned its warnings
 * into errors. The move to Vite took that away without anyone noticing, so for
 * a while `CI=true` in the workflow meant nothing at all. This puts it back,
 * and narrower: the rules that matter here are the hook rules, because every
 * real bug found in this project has been about effects, dependencies and
 * things happening in the wrong order.
 */
export default [
  { ignores: ['build/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // This is an application, not a library: every component has exactly one
      // caller, in this repository, and the tests exercise them through the
      // app. Declaring runtime prop types for all of them would be ceremony
      // that nothing reads.
      'react/prop-types': 'off',

      // An unused variable is usually a leftover; a caught error that is
      // deliberately ignored is not, and this codebase does that on purpose in
      // every localStorage guard.
      'no-unused-vars': ['error', { caughtErrors: 'none', argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },

  {
    files: ['**/*.test.{js,jsx}', 'src/testHelpers.js', 'src/setupTests.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
  },

  {
    files: ['scripts/**/*.mjs', '*.config.js', 'e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    // The scripts are command-line tools; printing is what they are for.
    rules: { 'no-console': 'off' },
  },

  {
    files: ['public/service-worker.js'],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
  },
];
