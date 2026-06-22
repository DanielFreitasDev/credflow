// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'prisma/migrations', 'src/generated'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript already resolves identifiers, so ESLint's no-undef is redundant
      // (and would flag Node globals like process/Buffer).
      'no-undef': 'off',
      // Allow intentionally-unused args/vars prefixed with `_`; don't flag caught errors.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
);
