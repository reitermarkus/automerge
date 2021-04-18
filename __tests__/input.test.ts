import { Input } from '../src/input'

const testEnvVars = {
  INPUT_TOKEN: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  'INPUT_MERGE-METHOD': '',
  'INPUT_DO-NOT-MERGE-LABELS': 'never-merge,blocked',
  'INPUT_REQUIRED-LABELS': 'automerge',
  'INPUT_PULL-REQUEST': '',
  'INPUT_PULL-REQUEST-AUTHOR-ASSOCIATION': '',
  'INPUT_DRY-RUN': '',
}

describe('input', () => {
  beforeEach(() => {
    for (const key in testEnvVars) {
      process.env[key] = testEnvVars[key as keyof typeof testEnvVars]
    }
  })

  it('correctly parses the input', () => {
    const input = new Input()

    expect(input.token).toBe('deadbeefcafebabedeadbeefcafebabedeadbeef')
    expect(input.mergeMethod).toBe(undefined)
    expect(input.doNotMergeLabels).toStrictEqual(['never-merge', 'blocked'])
    expect(input.requiredLabels).toStrictEqual(['automerge'])
    expect(input.pullRequest).toBe(null)
    expect(input.pullRequestAuthorAssociations).toStrictEqual([])
    expect(input.dryRun).toBe(false)
  })

  it('does not contain any required labels if the corresponding input is empty', () => {
    process.env['INPUT_REQUIRED-LABELS'] = ''

    const input = new Input()

    expect(input.requiredLabels).toStrictEqual([])
  })

  it('does not contain any “do not merge” labels if the corresponding input is empty', () => {
    process.env['INPUT_DO-NOT-MERGE-LABELS'] = ''

    const input = new Input()

    expect(input.doNotMergeLabels).toStrictEqual([])
  })

  it('fails if a “do not merge” label is required', () => {
    process.env['INPUT_DO-NOT-MERGE-LABELS'] = 'never-merge'
    process.env['INPUT_REQUIRED-LABELS'] = 'never-merge'

    expect(() => new Input()).toThrow()
  })

  it('accepts an optional `merge-method` input', () => {
    process.env['INPUT_MERGE-METHOD'] = 'squash'

    const input = new Input()

    expect(input.mergeMethod).toBe('squash')
  })

  it('fails with an unknown `merge-method` input', () => {
    process.env['INPUT_MERGE-METHOD'] = 'fixup'

    expect(() => new Input()).toThrow()
  })

  it('accepts an optional `pull-request` input', () => {
    process.env['INPUT_PULL-REQUEST'] = '1234'

    const input = new Input()

    expect(input.pullRequest).toBe(1234)
  })

  it('fails if `pull-request` input si not a number', () => {
    process.env['INPUT_PULL-REQUEST'] = 'abc'

    expect(() => new Input()).toThrow()
  })

  it('accepts an optional `pull-request-author-associations` input', () => {
    process.env['INPUT_PULL-REQUEST-AUTHOR-ASSOCIATIONS'] = 'COLLABORATOR,MEMBER,OWNER'

    const input = new Input()

    expect(input.pullRequestAuthorAssociations).toStrictEqual(['COLLABORATOR', 'MEMBER', 'OWNER'])
  })

  it('accepts an optional `dry-run` input', () => {
    process.env['INPUT_DRY-RUN'] = 'true'

    const input = new Input()

    expect(input.dryRun).toBe(true)
  })
})
