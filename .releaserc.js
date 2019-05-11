module.exports = {
  branch: 'master',
  plugins: [
    // analyse all our commits since the last release
    '@semantic-release/commit-analyzer',

    // generate some nice release notes to use in our GitHub release
    '@semantic-release/release-notes-generator',

    // if it's a library, bump the package.json version and publish to npm
    ['@semantic-release/npm'],

    // finally, push a new version as a release to GitHub with the changelog included
    [
      '@semantic-release/github',
      {
        failComment: false, // don't create a 'release failed' issue on the repo
        releasedLabels: ['published'], // tag PRs with [published] when release succeeded
        successComment: 'chore(release): ${nextRelease.version} [skip ci]\\n\\n${nextRelease.notes}',
        assets: [{ path: 'package.json', label: 'package.json' }]
      }
    ]
  ]
};
