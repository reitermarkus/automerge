import * as core from '@actions/core'
import * as github from '@actions/github'
import { isPresent } from 'ts-is-present'

import { Input } from './input'
import {
  isApprovedByAllowedAuthor,
  isAuthorAllowed,
  commitHasMinimumApprovals,
  passedRequiredStatusChecks,
  pullRequestsForWorkflowRun,
  requiredStatusChecksForBranch,
} from './helpers'
import { MergeMethod, Octokit, PullRequest } from './types'

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

    if (pullRequest.merged === true) {
      core.info(`Pull request ${number} is already merged.`)
      return false
    }

    if (pullRequest.state === 'closed') {
      core.info(`Pull request ${number} is closed.`)
      return false
    }

    const authorAssociations = this.input.pullRequestAuthorAssociations
    if (authorAssociations.length > 0 && !isAuthorAllowed(pullRequest, authorAssociations)) {
      core.info(
        `Author of pull request ${number} is ${pullRequest.author_association} but must be one of the following: ` +
          `${authorAssociations.join(', ')}`
      )
      return false
    }

    const baseBranch = pullRequest.base.ref
    const requiredStatusChecks = await requiredStatusChecksForBranch(this.octokit, baseBranch)

    // Only auto-merge if there is at least one required status check.
    if (requiredStatusChecks.length < 1) {
      core.info(`Base branch '${baseBranch}' of pull request ${number} is not sufficiently protected.`)
      return false
    }

    if (!(await passedRequiredStatusChecks(this.octokit, pullRequest, requiredStatusChecks))) {
      core.info(`Required status checks for pull request ${number} are not successful.`)
      return false
    }

    if (!(await this.isPullRequestApproved(pullRequest))) {
      core.info(`Pull request ${number} is not approved.`)
      return false
    }

    const labels = pullRequest.labels.map(({ name }) => name).filter(isPresent)
    const doNotMergeLabels = labels.filter(label => this.input.isDoNotMergeLabel(label))
    if (doNotMergeLabels.length > 0) {
      core.info(
        `Pull request ${number} is not mergeable because the following labels are applied: ` +
          `${doNotMergeLabels.join(', ')}`
      )
      return false
    }

    for (const requiredLabel of this.input.requiredLabels) {
      if (!labels.includes(requiredLabel)) {
        core.info(
          `Pull request ${number} is not mergeable because it does not have the required label: ${requiredLabel}`
        )
        return false
      }
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

        const useTitle = this.input.squashTitle && mergeMethod === 'squash'
        const commitTitle = useTitle ? `${pullRequest.title} (#${pullRequest.number})` : undefined
        const commitMessage = useTitle ? '\n' : undefined

        const titleMessage = useTitle ? ` with title '${commitTitle}'` : undefined

        if (this.input.dryRun) {
          core.info(`Would try merging pull request ${number}${titleMessage}.`)
          return false
        }

        try {
          core.info(`Merging pull request ${number}${titleMessage}:`)
          await this.octokit.pulls.merge({
            ...github.context.repo,
            pull_number: number,
            sha: pullRequest.head.sha,
            merge_method: mergeMethod,
            commit_title: commitTitle,
            commit_message: commitMessage,
          })

          core.info(`Successfully merged pull request ${number}.`)

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

  async isPullRequestApproved(pullRequest: PullRequest): Promise<boolean> {
    const reviews = (
      await this.octokit.pulls.listReviews({
        ...github.context.repo,
        pull_number: pullRequest.number,
        per_page: 100,
      })
    ).data

    if (reviews.length === 100) {
      core.setFailed('Handling pull requests with more than 100 reviews is not implemented.')
      return false
    }

    const commit = pullRequest.head.sha
    const minimumApprovals = 1
    return commitHasMinimumApprovals(reviews, this.input.reviewAuthorAssociations, commit, minimumApprovals)
  }

  async handlePullRequestReview(): Promise<void> {
    const { action, review, pull_request: pullRequest } = github.context.payload

    if (!action || !review || !pullRequest) {
      return
    }

    if (action === 'submitted' && isApprovedByAllowedAuthor(review, this.input.reviewAuthorAssociations)) {
      await this.automergePullRequests([pullRequest.number])
    }
  }

  async handlePullRequestTarget(): Promise<void> {
    const { action, label, pull_request: pullRequest } = github.context.payload

    if (!action || !pullRequest) {
      return
    }

    if (
      action === 'ready_for_review' ||
      (action === 'labeled' && this.input.requiredLabels.includes(label.name)) ||
      (action === 'unlabeled' && this.input.isDoNotMergeLabel(label.name))
    ) {
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
