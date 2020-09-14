import * as core from '@actions/core'
import * as github from '@actions/github'

import { Octokit, PullRequest, Review, WorkflowRun } from './types'

export const UNMERGEABLE_STATES = ['blocked']

function isChangeRequested(review: Review): boolean {
  return review.state.toUpperCase() === 'CHANGES_REQUESTED'
}

function isApproval(review: Review): boolean {
  return review.state.toUpperCase() === 'APPROVED'
}

export function relevantReviewsForCommit(reviews: Review[], commit: string): Review[] {
  return reviews
    .filter(
      review =>
        review.commit_id === commit &&
        (isApproval(review) || isChangeRequested(review)) &&
        isReviewAuthorMember(review)
    )
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
    .reduce(
      (acc: Review[], review) => (acc.some(r => r.user.login === review.user.login) ? acc : [...acc, review]),
      []
    )
    .reverse()
}

export function commitHasMinimumApprovals(reviews: Review[], commit: string, n: number): boolean {
  const relevantReviews = relevantReviewsForCommit(reviews, commit)

  // All last `n` reviews must be approvals.
  const lastNReviews = relevantReviews.reverse().slice(0, n)
  return lastNReviews.length >= n && lastNReviews.every(isApproval)
}

export async function isPullRequestApproved(octokit: Octokit, pullRequest: PullRequest): Promise<boolean> {
  const reviews = (
    await octokit.pulls.listReviews({
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
  return commitHasMinimumApprovals(reviews, commit, minimumApprovals)
}

export function isReviewAuthorMember(review: Review): boolean {
  return review.author_association === 'OWNER' || review.author_association === 'MEMBER'
}

export function isReviewApproved(review: Review): boolean {
  if (!isApproval(review)) {
    core.debug(`Review ${review.id} is not approved.`)
    return false
  }

  if (!isReviewAuthorMember(review)) {
    core.debug(`Review ${review.id} is approved but author is not a member or owner.`)
    return false
  }

  return true
}

export async function isBranchProtected(octokit: Octokit, branchName: string): Promise<boolean> {
  const branch = (
    await octokit.repos.getBranch({
      ...github.context.repo,
      branch: branchName,
    })
  ).data

  if (branch.protected === true && branch.protection.enabled === true) {
    // Only auto-merge if there is at least one required status check.
    const contexts = branch.protection.required_status_checks.contexts ?? []
    return contexts.length >= 1
  }

  return false
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
