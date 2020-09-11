import * as github from '@actions/github'
import { ActionsListWorkflowRunsResponseData, PullsGetResponseData } from '@octokit/types'

export type Octokit = ReturnType<typeof github.getOctokit>
export type PullRequest = PullsGetResponseData
export type WorkflowRun = ActionsListWorkflowRunsResponseData['workflow_runs'][0]
export type Review = { state: string; author_association: string; id: number }
export type MergeMethod = 'merge' | 'squash' | 'rebase' | undefined
