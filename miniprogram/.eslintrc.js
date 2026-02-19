/**
 * ESLint 配置文件
 * 用于代码规范检查和自动修复
 */

module.exports = {
  root: true,
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  globals: {
    wx: 'readonly',
    App: 'readonly',
    Page: 'readonly',
    Component: 'readonly',
    getApp: 'readonly',
    getCurrentPages: 'readonly',
  },
  rules: {
    // 错误级别规则
    'no-unused-vars': ['error', {
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: true,
    }],
    'no-undef': 'error',
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'no-empty': ['error', { allowEmptyCatch: false }],

    // 警告级别规则
    'no-console': ['warn', { allow: ['error', 'warn'] }],
    'no-debugger': 'warn',
    'no-alert': 'warn',
    'no-var': 'warn',
    'prefer-const': 'warn',
    'no-unused-expressions': 'warn',

    // 代码风格规则
    'indent': ['warn', 2, {
      SwitchCase: 1,
      VariableDeclarator: 1,
    }],
    'quotes': ['warn', 'single', {
      avoidEscape: true,
      allowTemplateLiterals: true,
    }],
    'semi': ['warn', 'always'],
    'comma-dangle': ['warn', 'always-multiline'],
    'max-len': ['warn', {
      code: 120,
      ignoreComments: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
    }],
    'no-trailing-spaces': 'warn',
    'eol-last': 'warn',

    // 最佳实践规则
    'eqeqeq': ['warn', 'always', { null: 'ignore' }],
    'curly': ['warn', 'multi-line'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-assign': 'warn',
    'no-throw-literal': 'warn',
    'prefer-promise-reject-errors': 'warn',

    // 变量声明规则
    'one-var': ['warn', 'never'],
    'no-multi-assign': 'warn',

    // 函数规则
    'max-params': ['warn', 4],
    'max-lines-per-function': ['warn', {
      max: 50,
      skipComments: true,
      skipBlankLines: true,
    }],

    // 注释规则
    'require-jsdoc': ['warn', {
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
      },
    }],
    'valid-jsdoc': 'warn',
  },
  overrides: [
    {
      // 针对配置文件的规则
      files: ['*.config.js', '.eslintrc.js'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // 针对工具文件的规则
      files: ['utils/**/*.js'],
      rules: {
        'max-lines-per-function': ['warn', { max: 100 }],
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'miniprogram_npm/',
    '*.min.js',
  ],
};
