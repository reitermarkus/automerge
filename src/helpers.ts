import * as core from '@actions/core'
import * as github from '@actions/github'

import { Octokit, PullRequest, Review, WorkflowRun } from './types'

export const UNMERGEABLE_STATES = ['blocked']

export function isChangesRequested(review: Review): boolean {
  return review.state.toUpperCase() === 'CHANGES_REQUESTED'
}

export function isApproved(review: Review): boolean {
  return review.state.toUpperCase() === 'APPROVED'
}

export function isAuthorAllowed(
  pullRequestOrReview: PullRequest | Review,
  reviewAuthorAssociations: string[]
): boolean {
  if (!pullRequestOrReview.author_association) {
    return false
  }

  return reviewAuthorAssociations.includes(pullRequestOrReview.author_association)
}

export function isApprovedByAllowedAuthor(review: Review, reviewAuthorAssociations: string[]): boolean {
  if (!isApproved(review)) {
    core.debug(`Review ${review.id} is not an approval.`)
    return false
  }

  if (!isAuthorAllowed(review, reviewAuthorAssociations)) {
    core.debug(
      `Review ${review.id} is approved, however author @${review.user?.login} ` +
        `is ${review.author_association} but must be one of the following:` +
        `${reviewAuthorAssociations.join(', ')}`
    )
    return false
  }

  return true
}

export function relevantReviewsForCommit(
  reviews: Review[],
  reviewAuthorAssociations: string[],
  commit: string
): Review[] {
  return reviews
    .filter(
      review =>
        review.commit_id === commit &&
        (isApproved(review) || isChangesRequested(review)) &&
        isAuthorAllowed(review, reviewAuthorAssociations)
    )
    .sort((a, b) => {
      const submittedA = a.submitted_at
      const submittedB = b.submitted_at

      return submittedA && submittedB ? Date.parse(submittedB) - Date.parse(submittedA) : 0
    })
    .reduce(
      (acc: Review[], review) =>
        acc.some(r => {
          const loginA = r.user?.login
          const loginB = review.user?.login

          return loginA && loginB && loginA === loginB
        })
          ? acc
          : [...acc, review],
      []
    )
    .reverse()
}

export function commitHasMinimumApprovals(
  reviews: Review[],
  reviewAuthorAssociations: string[],
  commit: string,
  n: number
): boolean {
  const relevantReviews = relevantReviewsForCommit(reviews, reviewAuthorAssociations, commit)

  // All last `n` reviews must be approvals.
  const lastNReviews = relevantReviews.reverse().slice(0, n)
  return lastNReviews.length >= n && lastNReviews.every(isApproved)
}

export async function requiredStatusChecksForBranch(octokit: Octokit, branchName: string): Promise<string[]> {
  const branch = (
    await octokit.repos.getBranch({
      ...github.context.repo,
      branch: branchName,
    })
  ).data

  if (branch.protected === true && branch.protection.enabled === true) {
    return branch.protection.required_status_checks.contexts ?? []
  }

  return []
}

export async function passedRequiredStatusChecks(
  octokit: Octokit,
  pullRequest: PullRequest,
  requiredChecks: string[]
): Promise<boolean> {
  const checkRuns = (
    await octokit.checks.listForRef({
      ...github.context.repo,
      ref: pullRequest.head.sha,
    })
  ).data.check_runs

  return requiredChecks.every(requiredCheck =>
    checkRuns.some(checkRun => checkRun.name === requiredCheck && checkRun.conclusion === 'success')
  )
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
