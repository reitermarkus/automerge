import * as core from '@actions/core'
import * as github from '@actions/github'

import { Input } from './input'
import { AutomergeAction } from './automerge-action'

async function run(): Promise<void> {
  try {
    const input = new Input()

    const octokit = github.getOctokit(input.token)

    const action = new AutomergeAction(octokit, input)

    const eventName = github.context.eventName
    switch (eventName) {
      case 'pull_request_review': {
        await action.handlePullRequestReview()
        break
      }
      default: {
        core.warning(`This action does not support the '${eventName}' event.`)
        break
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
