require('@uniswap/eslint-config/load')

module.exports = {
  extends: ['@uniswap/eslint-config/node'],

  overrides: [
    {
      // Somehow the import/no-unused-modules rule can't be turned off in rules
      files: ['*.ts'],
      rules: {
        'import/no-unused-modules': 'off',
        'prettier/prettier': [
          'error',
          {
            endOfLine: 'auto',
          },
        ],
      },
    },
  ],
}
