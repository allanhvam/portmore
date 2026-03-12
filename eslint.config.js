import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import stylistic from "@stylistic/eslint-plugin";

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module'
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      "@stylistic": stylistic,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@stylistic/semi": ["error", "always"],
      "@typescript-eslint/consistent-type-imports": "error",
      "@stylistic/comma-dangle": ["error", "always-multiline"],
    }
  }
];
