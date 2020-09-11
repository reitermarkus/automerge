import * as core from '@actions/core'
import * as github from '@actions/github'

import { Input } from './input'
import { pullRequestsForWorkflowRun } from './helpers'
import { Octokit } from './types'

function authorAssociationAllowed(authorAssociation: string): boolean {
  return authorAssociation === 'OWNER' || authorAssociation === 'MEMBER'
}

export class AutomergeAction {
  octokit: Octokit
  input: Input

  constructor(octokit: Octokit, input: Input) {
    this.octokit = octokit
    this.input = input
  }

  async automergePullRequest(number: number): Promise<void> {
    core.info(`Evaluating pull request ${number} for auto-mergeability…`)
  }

  async handlePullRequestReview(): Promise<void> {
    const { action, review, pull_request: pullRequest } = github.context.payload

    if (!action || !review || !pullRequest) {
      return
    }

    if (
      action === 'submitted' &&
      review.state === 'approved' &&
      authorAssociationAllowed(review.author_association)
    ) {
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
