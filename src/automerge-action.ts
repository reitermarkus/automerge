import * as core from '@actions/core'
import * as github from '@actions/github'

import { Input } from './input'
import {
  isBranchProtected,
  isDoNotMergeLabel,
  isPullRequestApproved,
  isReviewApproved,
  pullRequestsForWorkflowRun,
} from './helpers'
import { MergeMethod, Octokit } from './types'

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

      core.info('')
    }
  }

  async determineMergeMethod(): Promise<MergeMethod> {
    if (this.input.mergeMethod) {
      return this.input.mergeMethod
    }

    const repo = (await this.octokit.repos.get({ ...github.context.repo })).data

    if (repo.allow_merge_commit === true) {
      return 'merge'
    } else if (repo.allow_squash_merge === true) {
      return 'squash'
    } else if (repo.allow_rebase_merge === true) {
      return 'rebase'
    } else {
      return undefined
    }
  }

  async automergePullRequest(number: number, triesLeft: number): Promise<boolean> {
    core.info(`Evaluating mergeability for pull request ${number}:`)

    const pullRequest = (
      await this.octokit.pulls.get({
        ...github.context.repo,
        pull_number: number,
      })
    ).data

    const baseBranch = pullRequest.base.ref
    if (!(await isBranchProtected(this.octokit, baseBranch))) {
      core.info(`Base branch '${baseBranch}' of pull request ${number} is not sufficiently protected.`)
      return false
    }

    if (!(await isPullRequestApproved(this.octokit, pullRequest))) {
      core.info(`Pull request ${number} is not approved.`)
      return false
    }

    if (pullRequest.merged === true) {
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
      core.info(
        `Pull request ${number} is not mergeable because the following labels are applied: ${doNotMergeLabels.join(
          ', '
        )}`
      )
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
        core.info(`Pull request ${number} is mergeable with state '${mergeableState}'.`)

        const mergeMethod = await this.determineMergeMethod()

        try {
          if (this.input.dryRun) {
            core.info(`Would try merging pull request ${number}.`)
          } else {
            core.info(`Merging pull request ${number}:`)

            this.octokit.pulls.merge({
              ...github.context.repo,
              pull_number: number,
              sha: pullRequest.head.sha,
              merge_method: mergeMethod,
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

    if (pullRequests.length === 0) {
      core.info(`No open pull requests found.`)
      return
    }

    await this.automergePullRequests(pullRequests.map(({ number }) => number))
  }

  async handleWorkflowRun(): Promise<void> {
    const { action, workflow_run: workflowRun } = github.context.payload

    if (!action || !workflowRun) {
      return
    }

    const pullRequests = await pullRequestsForWorkflowRun(this.octokit, workflowRun)

    if (pullRequests.length === 0) {
      core.info(`No open pull requests found for workflow run ${workflowRun.id}.`)
      return
    }

    await this.automergePullRequests(pullRequests)
  }
}
