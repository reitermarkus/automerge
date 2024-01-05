import * as github from '@actions/github'

export type Octokit = ReturnType<typeof github.getOctokit>

export type PullRequest = Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data']
export type Review = Awaited<ReturnType<Octokit['rest']['pulls']['getReview']>>['data']

export type ReviewAuthorAssociation = Review['author_association']

export type MergeMethod = 'merge' | 'squash' | 'rebase' | undefined
