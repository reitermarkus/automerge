import * as core from '@actions/core'
import * as github from '@actions/github'

import { Input } from './input'
import { isApprovedReview, pullRequestsForWorkflowRun } from './helpers'
import { Octokit } from './types'

export class AutomergeAction {
  octokit: Octokit
  input: Input

  constructor(octokit: Octokit, input: Input) {
    this.octokit = octokit
    this.input = input
  }

  async automergePullRequest(number: number): Promise<void> {
    core.info(`Evaluating pull request ${number} for auto-mergeability…`)

    const pullRequest = await this.octokit.pulls.get({
      ...github.context.repo,
      pull_number: number,
    })

    core.info(`PULL_REQUEST: ${JSON.stringify(pullRequest, undefined, 2)}`)

    const reviews = await this.octokit.pulls.listReviews({
      ...github.context.repo,
      pull_number: number,
    })

    core.info(`REVIEWS: ${JSON.stringify(reviews, undefined, 2)}`)
  }

  async handlePullRequestReview(): Promise<void> {
    const { action, review, pull_request: pullRequest } = github.context.payload

    if (!action || !review || !pullRequest) {
      return
    }

    if (action === 'submitted' && isApprovedReview(review)) {
      await this.automergePullRequest(pullRequest.number)
    }
  }

  async handleSchedule(): Promise<void> {
    const pullRequests = await this.octokit.pulls.list({
      ...github.context.repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    })

    for (const pullRequest of pullRequests.data) {
      await this.automergePullRequest(pullRequest.number)
    }
  }

  async handleWorkflowRun(): Promise<void> {
    const { action, workflow_run: workflowRun } = github.context.payload

    if (!action || !workflowRun) {
      return
    }

    const pullRequests = await pullRequestsForWorkflowRun(this.octokit, workflowRun)

    for (const number of pullRequests) {
      await this.automergePullRequest(number)
    }
  }
}
