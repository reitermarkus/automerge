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

  async disableAutoMerge(pullRequest: PullRequest): Promise<DisableAutoMergeMutation> {
    // We need to get the source code of the query since the `@octokit/graphql`
    // API doesn't (yet) support passing a `DocumentNode` object.
    const query = DisableAutoMerge.loc!.source!.body

    return await this.octokit.graphql({
      query,
      pullRequestId: pullRequest.node_id,
    })
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

    return await this.octokit.graphql({
      query,
      pullRequestId: pullRequest.node_id,
      commitHeadline: commitTitle,
      commitBody: commitMessage,
      mergeMethod: mergeMethod?.toUpperCase(),
    })
  }

  async autoMergePullRequest(number: number): Promise<boolean> {
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

    const labels = pullRequest.labels.map(({ name }) => name).filter(isPresent)
    const doNotMergeLabels = labels.filter(label => this.input.isDoNotMergeLabel(label))
    if (doNotMergeLabels.length > 0) {
      core.info(
        `Pull request ${number} is not mergeable because the following labels are applied: ` +
          `${doNotMergeLabels.join(', ')}`
      )
      await this.disableAutoMerge(pullRequest)
      return false
    }

    for (const requiredLabel of this.input.requiredLabels) {
      if (!labels.includes(requiredLabel)) {
        core.info(
          `Pull request ${number} is not mergeable because it does not have the required label: ${requiredLabel}`
        )
        await this.disableAutoMerge(pullRequest)
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
      case 'dirty':
      case 'blocked':
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
          core.info(`Would try enabling auto-merge for pull request ${number}${titleMessage}.`)
          return false
        }

        try {
          core.info(`Enabling auto-merge for pull request ${number}${titleMessage}:`)

          // If auto-merge is already enabled with the same merge method, disable it
          // in order to update the commit title and message.
          const { auto_merge: autoMerge } = pullRequest
          if (autoMerge && commitTitle && commitMessage && autoMerge.merge_method == mergeMethod) {
            if (autoMerge.commit_title != commitTitle || autoMerge.commit_message != commitMessage) {
              await this.disableAutoMerge(pullRequest)
            }
          }

          const result = await this.enableAutoMerge(pullRequest, commitTitle, commitMessage, mergeMethod)
          core.info(JSON.stringify(result, null, 2))

          core.info(`Successfully enabled auto-merge for pull request ${number}.`)

          return false
        } catch (error) {
          const message = `Failed to enable auto-merge for pull request ${number}: ${error.message}`
          core.setFailed(message)
          return false
        }
      }
      default: {
        core.warning(`Unknown state for pull request ${number}: '${mergeableState}'`)
        return false
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
}
