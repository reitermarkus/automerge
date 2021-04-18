import { AutomergeAction } from '../src/automerge-action'
import { isDoNotMergeLabel } from '../src/helpers'
import { Review } from '../src/types'

describe('isDoNotMergeLabel', () => {
  it('detects a “do not merge” label', () => {
    expect(isDoNotMergeLabel('do not merge')).toBe(true)
  })

  it('detects a “do-not-merge” label', () => {
    expect(isDoNotMergeLabel('do not merge')).toBe(true)
  })

  it("detects a “don't merge” label", () => {
    expect(isDoNotMergeLabel("don't merge")).toBe(true)
  })

  it('does not detect a “donut-merge” label', () => {
    expect(isDoNotMergeLabel('donut-merge')).toBe(false)
  })

  it('does not detect a “do merge” label', () => {
    expect(isDoNotMergeLabel('do merge')).toBe(false)
  })
})
