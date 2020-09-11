import * as core from '@actions/core'

function getNumber(input: string, options?: core.InputOptions): number | null {
  const stringValue = core.getInput(input, options)

  if (stringValue === '' && !options?.required) {
    return null
  }

  const numberValue = parseInt(stringValue, 10)

  if (isNaN(numberValue)) {
    throw Error(`Failed parsing input '${input}' to number: '${stringValue}'`)
  }

  return numberValue
}

export class Input {
  token: string
  doNotMergeLabels: string[]
  minimumApprovals: number
  pullRequest: number | null

  constructor() {
    this.token = core.getInput('token', { required: true })
    this.doNotMergeLabels = core.getInput('do-not-merge-labels').split(',')
    this.minimumApprovals = getNumber('minimum-approvals', { required: true }) || 1
    this.pullRequest = getNumber('pull-request')
  }
}
