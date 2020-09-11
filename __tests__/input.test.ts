import { Input } from '../src/input'

const testEnvVars = {
  INPUT_TOKEN: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  'INPUT_DO-NOT-MERGE-LABELS': 'never-merge,blocked',
  'INPUT_MINIMUM-APPROVALS': '1',
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
    expect(input.doNotMergeLabels).toStrictEqual(['never-merge', 'blocked'])
    expect(input.pullRequest).toBe(null)
    expect(input.dryRun).toBe(false)
  })

  it('accepts an optional `pull-request` input', () => {
    process.env['INPUT_PULL-REQUEST'] = '1234'

    const input = new Input()

    expect(input.pullRequest).toBe(1234)
  })

  it('accepts an optional `dry-run` input', () => {
    process.env['INPUT_DRY-RUN'] = 'true'

    const input = new Input()

    expect(input.dryRun).toBe(true)
  })

  it('fails if `minimum-approvals` is not an integer', () => {
    process.env['INPUT_PULL-REQUEST'] = 'abc'
    expect(() => new Input()).toThrow()
  })

  it('fails if `minimum-approvals` is not specified', () => {
    process.env['INPUT_MINIMUM-APPROVALS'] = undefined
    expect(() => new Input()).toThrow()
  })

  it('fails if `minimum-approvals` is not an integer', () => {
    process.env['INPUT_MINIMUM-APPROVALS'] = 'abc'
    expect(() => new Input()).toThrow()
  })
})
