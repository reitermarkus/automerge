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
  pullRequest: number | null
  dryRun: boolean

  constructor() {
    this.token = core.getInput('token', { required: true })
    this.doNotMergeLabels = core.getInput('do-not-merge-labels').split(',')
    this.pullRequest = getNumber('pull-request')
    this.dryRun = core.getInput('dry-run') === 'true'
  }
}
