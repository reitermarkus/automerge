import * as core from '@actions/core'
import * as github from '@actions/github'

import { ReviewAuthorAssociation, Octokit, PullRequest, Review, RequiredStatusCheck } from './types'

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

export function isReviewAuthorAllowed(
  review: Review,
  authorAssociations: ReviewAuthorAssociation[]
): boolean {
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

export function isApprovedByAllowedAuthor(
  review: Review,
  authorAssociations: ReviewAuthorAssociation[]
): boolean {
  if (!isApproved(review)) {
    core.debug(`Review ${review.id} is not an approval.`)
    return false
  }

  return isReviewAuthorAllowed(review, authorAssociations)
}

export async function requiredStatusChecksForBranch(
  octokit: Octokit,
  branchName: string
): Promise<RequiredStatusCheck[]> {
  const branch = (
    await octokit.rest.repos.getBranch({
      ...github.context.repo,
      branch: branchName,
    })
  ).data

  var checksFromBranchProtection = []

  const rules = (
    await octokit.rest.repos.getBranchRules({
      ...github.context.repo,
      branch: branchName,
    })
  ).data

  const checksFromRules = rules.filter(rule => rule?.parameters?.required_status_checks)

  if (branch.protected === true && branch.protection.enabled === true) {
    checksFromBranchProtection = branch.protection.required_status_checks?.checks
  }

  return checksFromRules ?? checksFromBranchProtection ?? []
}

// Loosely match a “do not merge” label's name.
export function isDoNotMergeLabel(string: string): boolean {
  const label = string.toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = label.match(/^dono?tmerge$/)
  return match !== null
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
  return { title, message }
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
