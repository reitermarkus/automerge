import * as github from '@actions/github'
import { components as OCTOKIT_OPENAPI_TYPES } from '@octokit/openapi-types'

export type Octokit = ReturnType<typeof github.getOctokit>

export type PullRequest = OCTOKIT_OPENAPI_TYPES['schemas']['pull-request']
export type Review = OCTOKIT_OPENAPI_TYPES['schemas']['pull-request-review']
export type WorkflowRun = OCTOKIT_OPENAPI_TYPES['schemas']['workflow-run']
export type CheckSuite = OCTOKIT_OPENAPI_TYPES['schemas']['check-suite']
export type Repo = OCTOKIT_OPENAPI_TYPES['schemas']['minimal-repository']

export type MergeMethod = 'merge' | 'squash' | 'rebase' | undefined
