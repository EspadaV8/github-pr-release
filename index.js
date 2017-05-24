var fs = require('fs')

var releaseMessage = require('./lib/release-message.js')
var GithubClient = require('./lib/github-client.js')

module.exports = function createReleasePR (config) {
  var client = new GithubClient(config)
  let version = 0

  return client
    .getNextReleaseVersion()
    .then(function (ver) {
      version = ver
      return client
        .prepareReleaseBranch(version)
        .then(function (releaseBranchRef) {
          return client
            .prepareReleasePR(releaseBranchRef)
            .then(function (releasePR) {
              return client
                .collectReleasePRs(releasePR)
                .then(function (prs) {
                  const templatePath = config.template || __dirname + '/release.mustache'
                  const template = fs.readFileSync(templatePath, 'utf8')
                  const message = releaseMessage(version, template, prs)

                  return client.updatePR(releasePR, message)
                })
            })
        })
    })
}
