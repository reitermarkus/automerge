import * as core from '@actions/core'
import * as github from '@actions/github'
import { isPresent } from 'ts-is-present'

import {
  EnableAutoMerge,
  EnableAutoMergeMutation,
  DisableAutoMerge,
  DisableAutoMergeMutation,
} from './generated/graphql'

import { Input } from './input'
import {
  isAuthorAllowed,
  pullRequestsForWorkflowRun,
  pullRequestsForCheckSuite,
  requiredStatusChecksForBranch,
  squashCommit,
} from './helpers'
import { MergeMethod, Octokit, PullRequest } from './types'

export class AutomergeAction {
  octokit: Octokit
  input: Input

  constructor(octokit: Octokit, input: Input) {
    this.octokit = octokit
    this.input = input
  }

  async determineMergeMethod(): Promise<MergeMethod> {
    if (this.input.mergeMethod) {
      return this.input.mergeMethod
    }

    const repo = (await this.octokit.rest.repos.get({ ...github.context.repo })).data

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

  async enableAutoMerge(
    pullRequest: PullRequest,
    commitTitle: string | undefined,
    commitMessage: string | undefined,
    mergeMethod: MergeMethod
  ): Promise<EnableAutoMergeMutation> {
    // We need to get the source code of the query since the `@octokit/graphql`
    // API doesn't (yet) support passing a `DocumentNode` object.
    const query = EnableAutoMerge.loc!.source!.body

    try {
      return await this.octokit.graphql({
        query,
        pullRequestId: pullRequest.node_id,
        commitHeadline: commitTitle,
        commitBody: commitMessage,
        mergeMethod: mergeMethod?.toUpperCase(),
      })
    } catch (error) {
      if (error instanceof Error) {
        const message = `Failed to enable auto-merge for pull request ${pullRequest.number}: ${error.message}`
        throw new Error(message)
      }

      throw error
    }
  }

  async disableAutoMerge(pullRequest: PullRequest): Promise<DisableAutoMergeMutation> {
    try {
      core.info(`Disabling auto-merge for pull request ${pullRequest.number}.`)

      // We need to get the source code of the query since the `@octokit/graphql`
      // API doesn't (yet) support passing a `DocumentNode` object.
      const query = DisableAutoMerge.loc!.source!.body

      return await this.octokit.graphql({
        query,
        pullRequestId: pullRequest.node_id,
      })
    } catch (error) {
      if (error instanceof Error) {
        const message = `Failed to disable auto-merge for pull request ${pullRequest.number}: ${error.message}`
        throw new Error(message)
      }

      throw error
    }
  }

  async autoMergePullRequest(number: number): Promise<void> {
    core.info(`Evaluating mergeability for pull request ${number}:`)

    const pullRequest = (
      await this.octokit.rest.pulls.get({
        ...github.context.repo,
        pull_number: number,
      })
    ).data

    core.debug(`Evaluating pull request: ${JSON.stringify(pullRequest, null, 2)}`)

    if (pullRequest.merged === true) {
      core.info(`Pull request ${number} is already merged.`)
      return
    }

    if (pullRequest.state === 'closed') {
      core.info(`Pull request ${number} is closed.`)
      await this.disableAutoMerge(pullRequest)
      return
    }

    const authorAssociations = this.input.pullRequestAuthorAssociations
    if (authorAssociations.length > 0 && !isAuthorAllowed(pullRequest, authorAssociations)) {
      core.info(
        `Author of pull request ${number} is ${pullRequest.author_association} but must be one of the following: ` +
          `${authorAssociations.join(', ')}`
      )
      await this.disableAutoMerge(pullRequest)
      return
    }

    const baseBranch = pullRequest.base.ref
    const requiredStatusChecks = await requiredStatusChecksForBranch(this.octokit, baseBranch)

    // Only auto-merge if there is at least one required status check.
    if (requiredStatusChecks.length < 1) {
      core.info(`Base branch '${baseBranch}' of pull request ${number} is not sufficiently protected.`)
      await this.disableAutoMerge(pullRequest)
      return
    }

    const labels = pullRequest.labels.map(({ name }) => name).filter(isPresent)
    const doNotMergeLabels = labels.filter(label => this.input.isDoNotMergeLabel(label))
    if (doNotMergeLabels.length > 0) {
      core.info(
        `Pull request ${number} is not mergeable because the following labels are applied: ` +
          `${doNotMergeLabels.join(', ')}`
      )
      await this.disableAutoMerge(pullRequest)
      return
    }

    for (const requiredLabel of this.input.requiredLabels) {
      if (!labels.includes(requiredLabel)) {
        core.info(
          `Pull request ${number} is not mergeable because it does not have the required label: ${requiredLabel}`
        )
        await this.disableAutoMerge(pullRequest)
        return
      }
    }

    // https://docs.github.com/en/graphql/reference/enums#mergestatestatus
    const mergeableState = pullRequest.mergeable_state
    switch (mergeableState) {
      case 'draft': {
        core.info(`Pull request ${number} is not mergeable because it is a draft.`)
        await this.disableAutoMerge(pullRequest)
        return

        break
      }
      case 'dirty':
      case 'behind':
      case 'blocked':
      case 'clean':
      case 'has_hooks':
      case 'unknown':
      case 'unstable': {
        core.info(`Pull request ${number} is mergeable with state '${mergeableState}'.`)

        const mergeMethod = await this.determineMergeMethod()

        const { title: commitTitle, message: commitMessage } = squashCommit(
          mergeMethod === 'squash',
          this.input.squashCommitTitle,
          this.input.squashCommitMessage,
          pullRequest
        )

        const titleMessage = commitTitle ? ` with title '${commitTitle}'` : undefined

        if (this.input.dryRun) {
          core.info(`Would try enabling auto-merge for pull request ${number}${titleMessage}.`)
          return
        }

        // If auto-merge is already enabled with the same merge method, disable it
        // in order to update the commit title and message.
        const { auto_merge: autoMerge } = pullRequest
        if (autoMerge && commitTitle && commitMessage && autoMerge.merge_method == mergeMethod) {
          if (autoMerge.commit_title != commitTitle || autoMerge.commit_message != commitMessage) {
            core.info(
              `Auto-merge is already enabled for pull request ${number} but commit title/message does not match.`
            )
            await this.disableAutoMerge(pullRequest)
          }
        }

        core.info(`Enabling auto-merge for pull request ${number}${titleMessage}:`)
        const result = await this.enableAutoMerge(pullRequest, commitTitle, commitMessage, mergeMethod)

        if (result.enablePullRequestAutoMerge?.pullRequest?.autoMergeRequest?.enabledAt) {
          core.info(`Successfully enabled auto-merge for pull request ${number}.`)
        } else {
          throw new Error(`Failed to enable auto-merge for pull request ${number}.`)
        }

        break
      }
      default: {
        throw new Error(`Unsupported state for pull request ${number}: '${mergeableState}'`)

        break
      }
    }
  }

  async handlePullRequestTarget(): Promise<void> {
    core.debug('handlePullRequestTarget()')

    const { action, label, pull_request: pullRequest } = github.context.payload

    if (!action || !pullRequest) {
      return
    }

    await this.autoMergePullRequest(pullRequest.number)
  }

  async handleSchedule(): Promise<void> {
    core.debug('handleSchedule()')

    const pullRequests = (
      await this.octokit.rest.pulls.list({
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

    for (const pullRequest of pullRequests) {
      await this.autoMergePullRequest(pullRequest.number)
    }
  }
}
