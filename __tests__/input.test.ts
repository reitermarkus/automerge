import { Input } from '../src/input'

const testEnvVars = {
  INPUT_TOKEN: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  'INPUT_MERGE-METHOD': '',
  'INPUT_DO-NOT-MERGE-LABELS': 'never-merge,blocked',
  'INPUT_PULL-REQUEST': '',
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
    expect(input.pullRequest).toBe(null)
    expect(input.dryRun).toBe(false)
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

  it('accepts an optional `dry-run` input', () => {
    process.env['INPUT_DRY-RUN'] = 'true'

    const input = new Input()

    expect(input.dryRun).toBe(true)
  })
})
