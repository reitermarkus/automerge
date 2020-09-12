import * as core from '@actions/core'
import * as github from '@actions/github'

import { Octokit, PullRequest, Review, WorkflowRun } from './types'

export const UNMERGEABLE_STATES = ['blocked']

export function isReviewApproved(review: Review): boolean {
  if (review.state.toUpperCase() !== 'APPROVED') {
    core.debug(`Review ${review.id} is not approved.`)
    return false
  }

  if (review.author_association !== 'OWNER' && review.author_association !== 'MEMBER') {
    core.debug(`Review ${review.id} is approved but author is not a member or owner.`)
    return false
  }

  return true
}

export async function isBranchProtected(octokit: Octokit, branchName: string): Promise<boolean> {
  const branchArgs = {
    ...github.context.repo,
    branch: branchName,
  }

  const branch = (await octokit.repos.getBranch(branchArgs)).data

  if (branch.protected === true && branch.protection.enabled === true) {
    try {
      const protection = (await octokit.repos.getBranchProtection(branchArgs)).data

      // Only auto-merge if reviews are required and stale reviews are dismissed automatically.
      const requiredPullRequestReviews =
        protection.required_pull_request_reviews?.dismiss_stale_reviews || false

      // Only auto-merge if there is at least one required status check.
      const contexts = protection.required_status_checks?.contexts || []
      const requiredStatusChecks = contexts.length >= 1

      return requiredPullRequestReviews && requiredStatusChecks
    } catch (error) {
      if (error.status === 404) {
        core.setFailed(
          `Failed getting protection rules for branch '${branchName}': ${error.message}\nMake sure the specified 'token' has the rights to view branch protection rules.`
        )
      }
    }
  }

  return false
}

export function isPullRequestMergeable(pullRequest: PullRequest): boolean {
  return !pullRequest.merged
}

// Loosely match a “do not merge” label's name.
export function isDoNotMergeLabel(string: string): boolean {
  const label = string.toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = label.match(/^dono?tmerge$/)
  return match != null
}

export async function pullRequestsForWorkflowRun(
  octokit: Octokit,
  workflowRun: WorkflowRun
): Promise<number[]> {
  let pullRequests = (workflowRun.pull_requests as PullRequest[]).map(({ number }) => number)

  if (pullRequests.length === 0) {
    const headRepo = workflowRun.head_repository
    const headBranch = workflowRun.head_branch
    const headSha = workflowRun.head_sha

    pullRequests = (
      await octokit.pulls.list({
        ...github.context.repo,
        state: 'open',
        head: `${headRepo.owner.login}:${headBranch}`,
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      })
    ).data
      .filter(pr => pr.head.sha === headSha)
      .map(({ number }) => number)
  }

  return pullRequests
}
