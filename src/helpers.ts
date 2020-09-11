import * as github from '@actions/github'

import { Octokit, PullRequest, Review, WorkflowRun } from './types'

export function isApprovedReview(review: Review): boolean {
  return (
    review.state === 'APPROVED' &&
    (review.author_association === 'OWNER' || review.author_association === 'MEMBER')
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
