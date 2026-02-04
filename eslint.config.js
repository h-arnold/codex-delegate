import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import security from 'eslint-plugin-security';
import vitest from 'eslint-plugin-vitest';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '**/*.cjs', '**/*.d.ts'],
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylistic,
      vitest,
      security,
      import: importPlugin,
      jsdoc,
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // project: true, // This will be enabled in a separate config for src files
        // tsconfigRootDir: import.meta.dirname, // This will be enabled in a separate config for src files
      },
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: ['src/**/*.ts'], // Apply type-aware rules only to src TypeScript files
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.rules, // Use type-checked recommended rules
      ...security.configs.recommended.rules, // Apply security rules that might need type info
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'src/**/*.spec.ts'], // Apply type-aware rules and Vitest rules to test files
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.tests.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules, // Apply Vitest recommended rules
      // You might want to add more specific rules for test files here
    },
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.jsx'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
    },
  },
  {
    rules: {
      ...tseslint.configs.recommended.rules, // General TypeScript rules (non-type-aware)
      ...prettier.rules,

      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-eval': 'error',

      // Recommended `eslint-plugin-jsdoc` configuration. Enable the plugin and these rules
      // after verifying compatibility with the TypeScript setup.
      // Install: npm i -D eslint-plugin-jsdoc
      // Example recommended rules:
      // 'jsdoc/require-jsdoc': ['error', { require: { FunctionDeclaration: true, MethodDefinition: true, ClassDeclaration: true, ArrowFunctionExpression: true, FunctionExpression: true } }],
      // 'jsdoc/require-param': 'error',
      // 'jsdoc/require-returns': 'error',
      // Additional helpful rules you may enable (tweak severities as needed):
      // 'jsdoc/require-description': 'warn',
      // 'jsdoc/require-example': 'off',

      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-returns': 'error',

      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling']],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      'security/detect-eval-with-expression': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      'import/no-commonjs': 'error',
      complexity: ['warn', { max: 6 }],
      '@typescript-eslint/no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          enforceConst: true,
          detectObjects: false,
        },
      ],
    },
  },
  {
    files: [
      'tests/**/*.ts',
      'tests/**/*.tsx',
      'tests/**/*.js',
      'tests/**/*.jsx',
      'src/**/*.spec.ts',
    ],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    rules: {
      'import/no-commonjs': 'off',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'import/no-commonjs': 'off',
    },
  },
);
