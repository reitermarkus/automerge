import * as core from '@actions/core'
import * as github from '@actions/github'

import { Octokit, PullRequest, Review, WorkflowRun } from './types'

export const UNMERGEABLE_STATES = ['blocked']

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

  const relevantReviews = uniqueRelevantReviews(reviews)
  const relevantReviewsForCommit = relevantReviews.filter(review => review.commit_id === pullRequest.head.sha)

  return (
    relevantReviewsForCommit.length > 0 &&
    isReviewApproved(relevantReviewsForCommit[relevantReviewsForCommit.length - 1])
  )
}

function uniqueRelevantReviews(reviews: Review[]): Review[] {
  const relevantReviews = reviews.filter(
    review =>
      (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') && isReviewAuthorMember(review)
  )

  const reviewsByAuthor: { [key: string]: Review } = {}

  for (const relevantReview of relevantReviews) {
    reviewsByAuthor[relevantReview.user.login] = relevantReview
  }

  return Object.values(reviewsByAuthor)
}

export function isReviewAuthorMember(review: Review): boolean {
  return review.author_association === 'OWNER' || review.author_association === 'MEMBER'
}

export function isReviewApproved(review: Review): boolean {
  if (review.state.toUpperCase() !== 'APPROVED') {
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
    const contexts = branch.protection.required_status_checks.contexts || []
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
