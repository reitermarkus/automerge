import * as core from '@actions/core'

import { isDoNotMergeLabel } from './helpers'
import { MergeMethod } from './types'

function getNumber(input: string, options?: core.InputOptions): number | null {
  const stringValue = core.getInput(input, options)

  if (!stringValue) {
    return null
  }

  const numberValue = parseInt(stringValue, 10)

  if (isNaN(numberValue)) {
    throw new Error(`Failed parsing input '${input}' to number: '${stringValue}'`)
  }

  return numberValue
}

function getArray(input: string, options?: core.InputOptions): string[] {
  const stringValue = core.getInput(input, options)
  return (stringValue || null)?.split(',') ?? []
}

export class Input {
  token: string
  mergeMethod: MergeMethod
  squashCommitTitle: string | undefined
  squashCommitMessage: string | undefined
  doNotMergeLabels: string[]
  requiredLabels: string[]
  pullRequest: number | null
  pullRequestAuthorAssociations: string[]
  dryRun: boolean

  constructor() {
    this.token = core.getInput('token', { required: true })

    const mergeMethod = core.getInput('merge-method') || undefined
    switch (mergeMethod) {
      case 'squash':
      case 'rebase':
      case 'merge':
      case undefined: {
        this.mergeMethod = mergeMethod
        break
      }
      default: {
        throw new Error(`Unknown merge method: '${mergeMethod}'`)
      }
    }

    if (core.getInput('squash-title') === 'true') {
      this.squashCommitTitle = "${pullRequest.title} (#${pullRequest.number})"
      this.squashCommitMessage = "\n"
    } else{
      this.squashCommitTitle = core.getInput('squash-commit-title') || undefined
      this.squashCommitMessage = core.getInput('squash-commit-message') || undefined
    }

    this.doNotMergeLabels = getArray('do-not-merge-labels')
    this.requiredLabels = getArray('required-labels')

    for (const requiredLabel of this.requiredLabels) {
      if (this.isDoNotMergeLabel(requiredLabel)) {
        throw new Error(`Cannot set a “do not merge” label as a required label.`)
      }
    }

    this.pullRequest = getNumber('pull-request')
    this.pullRequestAuthorAssociations = getArray('pull-request-author-associations')

    this.dryRun = core.getInput('dry-run') === 'true'
  }

  isDoNotMergeLabel(label: string): boolean {
    return this.doNotMergeLabels.includes(label) || isDoNotMergeLabel(label)
  }
}
