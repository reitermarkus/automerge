import * as core from '@actions/core'
import * as github from '@actions/github'

import { Input } from './input'
import {
  isBranchProtected,
  isDoNotMergeLabel,
  isReviewApproved,
  pullRequestsForWorkflowRun,
} from './helpers'
import { Octokit } from './types'

export class AutomergeAction {
  octokit: Octokit
  input: Input

  constructor(octokit: Octokit, input: Input) {
    this.octokit = octokit
    this.input = input
  }

  async automergePullRequests(numbers: number[]): Promise<void> {
    const maxTries = 5
    const retries = maxTries - 1

    const queue = numbers.map(number => ({ number, tries: 0 }))

    let arg
    while ((arg = queue.shift())) {
      const { number, tries } = arg

      if (tries > 0) {
        await new Promise(r => setTimeout(r, 2 ** tries * 1000))
      }

      const triesLeft = retries - tries
      const retry = await this.automergePullRequest(number, triesLeft)

      if (retry) {
        queue.push({ number, tries: tries + 1 })
      }
    }
  }

  async automergePullRequest(number: number, triesLeft: number): Promise<boolean> {
    core.info(`Evaluating auto-mergeability for pull request ${number}:`)

    const pullRequest = (
      await this.octokit.pulls.get({
        ...github.context.repo,
        pull_number: number,
      })
    ).data

    const baseBranch = pullRequest.base.ref
    if (!isBranchProtected(this.octokit, baseBranch)) {
      core.info(`Base branch '${baseBranch}' of pull request ${number} is not protected.`)
      return false
    }

    if (pullRequest.merged) {
      core.info(`Pull request ${number} is already merged.`)
      return false
    }

    if (pullRequest.state === 'closed') {
      core.info(`Pull request ${number} is closed.`)
      return false
    }

    const labels = pullRequest.labels.map(({ name }) => name)
    const doNotMergeLabels = labels.filter(
      label => this.input.doNotMergeLabels.includes(label) || isDoNotMergeLabel(label)
    )
    if (doNotMergeLabels.length > 0) {
      core.info(`Pull request contains “do not merge” labels: ${doNotMergeLabels.join(', ')}`)
      return false
    }

    // https://docs.github.com/en/graphql/reference/enums#mergestatestatus
    const mergeableState = pullRequest.mergeable_state
    switch (mergeableState) {
      case 'draft': {
        core.info(`Pull request ${number} is not mergeable because it is a draft.`)
        return false
      }
      case 'dirty': {
        core.info(`Pull request ${number} is not mergeable because it is dirty.`)
        return false
      }
      case 'blocked': {
        core.info(`Merging is blocked for pull request ${number}.`)
        return false
      }
      case 'clean':
      case 'has_hooks':
      case 'unknown':
      case 'unstable': {
        try {
          if (this.input.dryRun) {
            core.info(`Would try merging pull request ${number} in '${mergeableState}' state:`)
          } else {
            core.info(`Trying to merge pull request ${number} in '${mergeableState}' state:`)

            this.octokit.pulls.merge({
              ...github.context.repo,
              pull_number: number,
            })

            core.info(`Successfully merged pull request ${number}.`)
          }

          return false
        } catch (error) {
          const message = `Failed to merge pull request ${number} (${triesLeft} tries left): ${error.message}`
          if (triesLeft === 0) {
            core.setFailed(message)
            return false
          } else {
            core.error(message)
            return true
          }
        }
      }
      default: {
        core.warning(`Unknown state for pull request ${number}: '${mergeableState}'`)
        return false
      }
    }
  }

  async handlePullRequestReview(): Promise<void> {
    const { action, review, pull_request: pullRequest } = github.context.payload

    if (!action || !review || !pullRequest) {
      return
    }

    if (action === 'submitted' && isReviewApproved(review)) {
      await this.automergePullRequests([pullRequest.number])
    }
  }

  async handlePullRequestTarget(): Promise<void> {
    const { action, pull_request: pullRequest } = github.context.payload

    if (!action || !pullRequest) {
      return
    }

    if (action === 'ready_for_review') {
      await this.automergePullRequests([pullRequest.number])
    }
  }

  async handleSchedule(): Promise<void> {
    const pullRequests = (
      await this.octokit.pulls.list({
        ...github.context.repo,
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      })
    ).data

    await this.automergePullRequests(pullRequests.map(({ number }) => number))
  }

  async handleWorkflowRun(): Promise<void> {
    const { action, workflow_run: workflowRun } = github.context.payload

    if (!action || !workflowRun) {
      return
    }

    const pullRequests = await pullRequestsForWorkflowRun(this.octokit, workflowRun)

    for (const number of pullRequests) {
      await this.automergePullRequests([number])
    }
  }
}
