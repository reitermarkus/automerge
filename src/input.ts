import * as core from '@actions/core'

export class Input {
  token: string
  doNotMergeLabels: string[]
  pullRequest: number | null

  constructor() {
    this.token = core.getInput('token', { required: true })
    this.doNotMergeLabels = core.getInput('token').split(',')

    try {
      const pullRequest = core.getInput('pull-request') || null

      if (pullRequest) {
        this.pullRequest = parseInt(pullRequest)
      } else {
        this.pullRequest = null
      }
    } catch (error) {
      throw Error(`Failed getting input 'pull-request': ${error}`)
    }
  }
}
