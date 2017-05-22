var release = require('.')

var config = {
  token: '95d70d9cc101e83859908390206856caf62146de',
  owner: 'intellihr',
  repo: 'github-pr-release-test',
  head: 'develop',                       // optional
  releaseBranch: 'release',
  base: 'master',                   // optional
  template: 'release.mustache' // optional
}

release(config)
