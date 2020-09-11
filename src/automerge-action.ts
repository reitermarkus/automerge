import * as core from '@actions/core'
import * as github from '@actions/github'

import { Input } from './input'

function authorAssociationAllowed(authorAssociation: string): boolean {
  return authorAssociation === 'OWNER' || authorAssociation === 'MEMBER'
}

export class AutomergeAction {
  octokit: ReturnType<typeof github.getOctokit>
  input: Input

  constructor(octokit: ReturnType<typeof github.getOctokit>, input: Input) {
    this.octokit = octokit
    this.input = input
  }

  async automergePullRequest(number: number): Promise<void> {
    core.info(`Evaluating pull request ${number} for auto-mergeability…`)
  }

  async handlePullRequestReview(): Promise<void> {
    const { action, review, pull_request } = github.context.payload

    if (!action || !review || !pull_request) {
      return
    }

    if (
      action === 'submitted' &&
      review.state === 'approved' &&
      authorAssociationAllowed(review.author_association)
    ) {
      await this.automergePullRequest(pull_request.number)
    }
  }
}
