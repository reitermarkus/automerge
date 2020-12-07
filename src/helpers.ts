import * as core from '@actions/core'
import * as github from '@actions/github'

import { CheckSuite, Octokit, PullRequest, Repo, Review, WorkflowRun } from './types'

export const UNMERGEABLE_STATES = ['blocked']

export function isChangesRequested(review: Review): boolean {
  return review.state.toUpperCase() === 'CHANGES_REQUESTED'
}

export function isApproved(review: Review): boolean {
  return review.state.toUpperCase() === 'APPROVED'
}

export function isAuthorAllowed(
  pullRequestOrReview: PullRequest | Review,
  authorAssociations: string[]
): boolean {
  if (!pullRequestOrReview.author_association) {
    return false
  }

  return authorAssociations.includes(pullRequestOrReview.author_association)
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
    .filter(review => review.commit_id === commit)
    .filter(review => {
      const isRelevant = isApproved(review) || isChangesRequested(review)
      if (!isRelevant) {
        core.debug(`Review ${review.id} for commit ${commit} is not relevant.`)
        return false
      }

      const isReviewAuthorAllowed = isAuthorAllowed(review, reviewAuthorAssociations)
      if (!isReviewAuthorAllowed) {
        core.debug(
          `Author @${review.user?.login} (${review.author_association}) of review ${review.id} for commit ${commit} is not allowed.`
        )
        return false
      }

      return true
    })
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
  core.debug(`Checking review for commit ${commit}:`)
  core.debug(`Commit ${commit} has ${reviews.length} reviews.`)
  const relevantReviews = relevantReviewsForCommit(reviews, reviewAuthorAssociations, commit)
  core.debug(`Commit ${commit} has ${relevantReviews.length} relevant reviews.`)

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

async function pullRequestsMatching(
  octokit: Octokit,
  repo: Repo,
  branch: String | null,
  sha: String
): Promise<number[]> {
  const repoOwner = repo.owner?.login

  if (!repoOwner) return []

  const pullRequests = (
    await octokit.pulls.list({
      ...github.context.repo,
      state: 'open',
      head: `${repoOwner}:${branch}`,
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    })
  ).data as PullRequest[]

  return pullRequests.filter(pr => pr.head.sha === sha).map(({ number }) => number)
}

export async function pullRequestsForCheckSuite(octokit: Octokit, checkSuite: CheckSuite): Promise<number[]> {
  let pullRequests = (checkSuite.pull_requests as PullRequest[]).map(({ number }) => number)

  if (pullRequests.length === 0)
    pullRequests = await pullRequestsMatching(
      octokit,
      checkSuite.repository,
      checkSuite.head_branch,
      checkSuite.head_sha
    )

  return pullRequests
}

export async function pullRequestsForWorkflowRun(
  octokit: Octokit,
  workflowRun: WorkflowRun
): Promise<number[]> {
  let pullRequests = (workflowRun.pull_requests as PullRequest[]).map(({ number }) => number)

  if (pullRequests.length === 0)
    pullRequests = await pullRequestsMatching(
      octokit,
      workflowRun.head_repository,
      workflowRun.head_branch,
      workflowRun.head_sha
    )

  return pullRequests
}
