import * as github from '@actions/github'
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types'

export type Octokit = ReturnType<typeof github.getOctokit>

export type WorkflowRun = GetResponseDataTypeFromEndpointMethod<
  Octokit['actions']['listWorkflowRuns']
>['workflow_runs'][0]

export type PullRequest = GetResponseDataTypeFromEndpointMethod<Octokit['pulls']['get']>

export type Review = {
  id: number
  user: { login: string } | null
  state: string
  submitted_at?: string
  commit_id: string
  author_association?: string // https://github.com/octokit/types.ts/issues/221
}

export type MergeMethod = 'merge' | 'squash' | 'rebase' | undefined
