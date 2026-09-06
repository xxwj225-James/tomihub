import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import js from '@eslint/js';

export default tseslint.config(
  // Base recommended rulesets
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ─── TomatoHub Rules (per CLAUDE.md Part 2 & Part 5) ───
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // React hooks correctness
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // CLAUDE.md Part 2.1 — Type Safety
      '@typescript-eslint/no-explicit-any': 'error',         // No `any` type
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true },           // No @ts-ignore / @ts-nocheck
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // CLAUDE.md Part 5 — Pre-Commit Checklist
      'no-console': 'error',                                 // No console.log in production
      'no-debugger': 'error',                                // No debugger statements

      // Code quality
      'no-cond-assign': 'error',                             // if (x = 5) → error
      'no-const-assign': 'error',                            // const x = 1; x = 2 → error
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',                               // let x = 1; → const x = 1
    },
  },

  // ─── Ignored paths ───
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '*.config.*',        // vite.config.ts, eslint.config.js, etc.
    ],
  },
);
