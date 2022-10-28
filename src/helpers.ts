import * as core from '@actions/core'
import * as github from '@actions/github'

import {
  AuthorAssociation,
  CheckRun,
  CheckSuite,
  CommitStatus,
  Octokit,
  PullRequest,
  Repo,
  Review,
  WorkflowRun,
} from './types'

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
  if (pullRequestOrReview.user?.login === 'github-actions[bot]') {
    return true
  }

  if (!pullRequestOrReview.author_association) {
    return false
  }

  return authorAssociations.includes(pullRequestOrReview.author_association)
}

export function isReviewAuthorAllowed(review: Review, authorAssociations: AuthorAssociation[]): boolean {
  if (!isAuthorAllowed(review, authorAssociations)) {
    core.debug(
      `Author @${review.user?.login} of review ${review.id} ` +
        `is ${review.author_association} but must be one of the following:` +
        `${authorAssociations.join(', ')}`
    )

    return false
  }

  return true
}

export function isApprovedByAllowedAuthor(review: Review, authorAssociations: AuthorAssociation[]): boolean {
  if (!isApproved(review)) {
    core.debug(`Review ${review.id} is not an approval.`)
    return false
  }

  return isReviewAuthorAllowed(review, authorAssociations)
}

export async function requiredStatusChecksForBranch(octokit: Octokit, branchName: string): Promise<string[]> {
  const branch = (
    await octokit.rest.repos.getBranch({
      ...github.context.repo,
      branch: branchName,
    })
  ).data

  if (branch.protected === true && branch.protection.enabled === true) {
    return branch.protection.required_status_checks?.contexts ?? []
  }

  return []
}

// Loosely match a “do not merge” label's name.
export function isDoNotMergeLabel(string: string): boolean {
  const label = string.toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = label.match(/^dono?tmerge$/)
  return match != null
}

async function pullRequestsForCommit(
  octokit: Octokit,
  repo: Repo,
  branch: String | null,
  sha: String
): Promise<number[]> {
  const repoOwner = repo.owner?.login

  if (!repoOwner) return []

  const pullRequests = (
    await octokit.rest.pulls.list({
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
  let pullRequests = checkSuite.pull_requests?.map(({ number }) => number) ?? []

  if (pullRequests.length === 0)
    pullRequests = await pullRequestsForCommit(
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
  let pullRequests = workflowRun.pull_requests?.map(({ number }) => number) ?? []

  if (pullRequests.length === 0)
    pullRequests = await pullRequestsForCommit(
      octokit,
      workflowRun.head_repository,
      workflowRun.head_branch,
      workflowRun.head_sha
    )

  return pullRequests
}

export function squashCommit(
  isSquashCommit: boolean,
  squashCommitTitle: string | undefined,
  squashCommitMessage: string | undefined,
  pullRequest: PullRequest
): { title: string | undefined; message: string | undefined } {
  if (!isSquashCommit) {
    return { title: undefined, message: undefined }
  }

  const title = squashCommitTitle
    ? substitutePullRequestParams(squashCommitTitle, pullRequest, true)
    : undefined
  const message = squashCommitMessage
    ? substitutePullRequestParams(squashCommitMessage, pullRequest, false)
    : undefined
  return { title: title, message: message }
}

function substitutePullRequestParams(input: string, pullRequest: PullRequest, isTitle: boolean): string {
  const output = input
    .replace('${pull_request.title}', pullRequest.title)
    .replace('${pull_request.number}', `${pullRequest.number}`)

  if (isTitle) {
    return output
  } else {
    // reserve these replacements for the commit message only
    return output.replace('${pull_request.body}', pullRequest.body ? pullRequest.body : '\n')
  }
}
