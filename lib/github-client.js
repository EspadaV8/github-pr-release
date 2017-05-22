var request = require('request')
var Promise = require('es6-promise').Promise
var parseLinkHeader = require('parse-link-header')

function GithubClient (config) {
  this.owner = config.owner
  this.repo = config.repo
  this.token = config.token
  this.head = config.head || 'master'
  this.base = config.base || 'production'
  this.endpoint = config.endpoint || 'https://api.github.com'
  this.releaseBranch = config.releaseBranch || 'release'
}

GithubClient.prototype.pullRequestEndpoint = function () {
  return this.endpoint + '/repos/' + this.owner + '/' + this.repo + '/pulls'
}

GithubClient.prototype.getRefEndpoint = function (ref) {
  return this.endpoint + '/repos/' + this.owner + '/' + this.repo + '/git/refs/heads/' + ref
}

GithubClient.prototype.referenceEndpoint = function (ref) {
  return this.endpoint + '/repos/' + this.owner + '/' + this.repo + '/git/refs'
}

GithubClient.prototype.latestReleaseEndpoint = function (ref) {
  return this.endpoint + '/repos/' + this.owner + '/' + this.repo + '/releases/latest'
}

GithubClient.prototype.headers = function () {
  return {
    'Authorization': 'token ' + this.token,
    'User-Agent': 'uiureo/github-pr-release'
  }
}

GithubClient.prototype.get = function (url, query) {
  var self = this
  query = query || {}

  return new Promise(function (resolve, reject) {
    request.get({
      url: url,
      qs: query,
      headers: self.headers(),
      json: true
    }, function (err, res) {
      if (err) return reject(err)
      resolve(res)
    })
  })
}

GithubClient.prototype.post = function (url, body) {
  var self = this
  body = body || {}

  return new Promise(function (resolve, reject) {
    request.post({
      url: url,
      body: body,
      json: true,
      headers: self.headers()
    }, function (err, res, body) {
      if (err) return reject(err)

      resolve(res)
    })
  })
}

GithubClient.prototype.patch = function (url, body) {
  var self = this
  body = body || {}

  return new Promise(function (resolve, reject) {
    request.patch({
      url: url,
      body: body,
      json: true,
      headers: self.headers()
    }, function (err, res, body) {
      if (err) return reject(err)

      resolve(res)
    })
  })
}

GithubClient.prototype.getNextReleaseVersion = function () {
  const self = this

  return self.get(self.latestReleaseEndpoint())
    .then(function (release) {
      if (release.statusCode === 404) {
        return 1
      }

      return parseInt(release.body.name, 10) + 1
    })
}

GithubClient.prototype.prepareReleaseBranch = function (version) {
  const self = this
  version = version || 1

  return self.get(
      self.getRefEndpoint(self.head)
    ).then(function (res) {
      return res.body.object.sha
    }).then(function (sha) {
      return self.post(
        self.referenceEndpoint(),
        {
          sha: sha,
          ref: 'refs/heads/' + self.releaseBranch + '/' + version
        }
      )
    })
}

GithubClient.prototype.prepareReleasePR = function (releaseBranchRef) {
  var self = this
  const headRef = releaseBranchRef.body.ref

  return self.post(self.pullRequestEndpoint(), {
    title: 'Preparing release pull request...',
    head: headRef,
    base: self.base
  }).then(function (res) {
    if (res.statusCode === 201) {
      return res.body
    } else if (res.statusCode === 422) {
      var errMessage = res.body.errors[0].message
      if (!errMessage.match(/pull request already exists/)) {
        return Promise.reject(new Error(errMessage))
      }
      return self.get(self.pullRequestEndpoint(), {
        base: headRef,
        head: self.head,
        state: 'open'
      }).then(function (res) {
        return res.body[0]
      })
    } else {
      return Promise.reject(new Error(res.body.message))
    }
  })
}

GithubClient.prototype.getPRCommits = function (pr) {
  var self = this
  var result = []

  function getCommits (page) {
    page = page || 1

    return self.get(
      self.pullRequestEndpoint() + '/' + pr.number + '/commits',
      {
        per_page: 100,
        page: page
      }
    ).then(function (res) {
      var commits = res.body
      result = result.concat(commits)

      var link = parseLinkHeader(res.headers.link)

      if (link && link.next) {
        return getCommits(page + 1)
      } else {
        return result
      }
    })
  }

  return getCommits().catch(console.error.bind(console))
}

GithubClient.prototype.collectReleasePRs = function (releasePR) {
  var self = this

  return self.getPRCommits(releasePR).then(function (commits) {
    var shas = commits.map(function (commit) {
      return commit.sha
    })

    return self.get(self.pullRequestEndpoint(), {
      state: 'closed',
      base: self.head,
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    }).then(function (res) {
      var prs = res.body

      var mergedPRs = prs.filter(function (pr) {
        return pr.merged_at !== null
      })

      var prsToRelease = mergedPRs.reduce(function (result, pr) {
        if (shas.indexOf(pr.head.sha) > -1 ||
            shas.indexOf(pr.merge_commit_sha) > -1) {
          result.push(pr)
        }

        return result
      }, [])

      prsToRelease.sort(function (a, b) {
        return new Date(a.merged_at) - new Date(b.merged_at)
      })

      return prsToRelease
    })
  })
}

GithubClient.prototype.updatePR = function (pr, data) {
  return this.patch(this.pullRequestEndpoint() + '/' + pr.number, data).then(function (res) {
    return res.body
  })
}

module.exports = GithubClient
