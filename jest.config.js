module.exports = {
  projects: [
    {
      displayName: 'test',
      testEnvironment: 'node',
      transform: {
        '.(ts|tsx)': 'ts-jest'
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      testRegex: '(/test/.*|(\\.|/)(tests))\\.(ts|js)x?$',
      testPathIgnorePatterns: ['./test/support/'],
      coverageDirectory: 'coverage',
      collectCoverageFrom: ['index.ts', 'src/**/*.{ts,tsx,js,jsx}', '!src/**/*.d.ts']
    },
    {
      displayName: 'eslint',
      runner: 'jest-runner-eslint',
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      testMatch: ['**/test/*.{ts,tsx}'],
      testPathIgnorePatterns: ['build', 'coverage']
    }
  ]
};
