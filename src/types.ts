import * as github from '@actions/github'

export type Octokit = ReturnType<typeof github.getOctokit>

export type PullRequest = Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data']
export type Review = Awaited<ReturnType<Octokit['rest']['pulls']['getReview']>>['data']

export type Branch = Awaited<ReturnType<Octokit['rest']['repos']['getBranch']>>['data']
export type RequiredStatusCheck = Exclude<
  Branch['protection']['required_status_checks'],
  undefined
>['checks'][0]

export type ReviewAuthorAssociation = Review['author_association']

export type MergeMethod = 'merge' | 'squash' | 'rebase' | undefined
