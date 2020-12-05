import { AutomergeAction } from '../src/automerge-action'
import { commitHasMinimumApprovals, isDoNotMergeLabel, relevantReviewsForCommit } from '../src/helpers'
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

const reviews = [
  {
    state: 'APPROVED',
    author_association: 'NONE',
    id: 1,
    user: { login: 'user1' },
    submitted_at: '2020-09-05T14:13:08Z',
    commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  },
  {
    state: 'CHANGES_REQUESTED',
    author_association: 'OWNER',
    id: 4,
    user: { login: 'reitermarkus' },
    submitted_at: '2020-09-05T13:15:32Z',
    commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  },
  {
    state: 'APPROVED',
    author_association: 'OWNER',
    id: 3,
    user: { login: 'reitermarkus' },
    submitted_at: '2020-09-05T13:15:02Z',
    commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  },
  {
    state: 'COMMENTED',
    author_association: 'NONE',
    id: 5,
    user: { login: 'user2' },
    submitted_at: '2020-09-05T18:13:08Z',
    commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  },
  {
    state: 'CHANGES_REQUESTED',
    author_association: 'MEMBER',
    id: 2,
    user: { login: 'member1' },
    submitted_at: '2020-09-05T12:15:02Z',
    commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
  },
  {
    state: 'APPROVED',
    author_association: 'OWNER',
    id: 6,
    user: { login: 'reitermarkus' },
    submitted_at: '2020-09-05T18:15:02Z',
    commit_id: 'deadbeefcafebabedeadbeefffffffffffffffff',
  },
]

const reviewAuthorAssociations = ['MEMBER', 'OWNER']

const commit = 'deadbeefcafebabedeadbeefcafebabedeadbeef'

describe('relevantReviewsForCommit', () => {
  it('returns the latest relevant review for each author who is a member or owner', () => {
    expect(
      relevantReviewsForCommit(reviews, reviewAuthorAssociations, commit).map(r => [r.user?.login, r.state])
    ).toStrictEqual([
      ['member1', 'CHANGES_REQUESTED'],
      ['reitermarkus', 'CHANGES_REQUESTED'],
    ])
  })
})

describe('commitHasMinimumApprovals', () => {
  it('returns false if the last n relevent reviews are not approved', () => {
    expect(commitHasMinimumApprovals(reviews, reviewAuthorAssociations, commit, 0)).toBe(true)
    expect(commitHasMinimumApprovals(reviews, reviewAuthorAssociations, commit, 1)).toBe(false)
    expect(commitHasMinimumApprovals(reviews, reviewAuthorAssociations, commit, 2)).toBe(false)
    expect(commitHasMinimumApprovals(reviews, reviewAuthorAssociations, commit, 3)).toBe(false)
  })

  it('returns true if the last n relevent reviews are approved', () => {
    const reviewsIncluding1Approval = [
      ...reviews,
      {
        state: 'APPROVED',
        author_association: 'OWNER',
        id: 7,
        user: { login: 'reitermarkus' },
        submitted_at: '2020-09-05T19:15:02Z',
        commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
      },
    ]

    expect(commitHasMinimumApprovals(reviewsIncluding1Approval, reviewAuthorAssociations, commit, 0)).toBe(
      true
    )
    expect(commitHasMinimumApprovals(reviewsIncluding1Approval, reviewAuthorAssociations, commit, 1)).toBe(
      true
    )
    expect(commitHasMinimumApprovals(reviewsIncluding1Approval, reviewAuthorAssociations, commit, 2)).toBe(
      false
    )
    expect(commitHasMinimumApprovals(reviewsIncluding1Approval, reviewAuthorAssociations, commit, 3)).toBe(
      false
    )
  })

  it('returns true if the last n relevent reviews are approved', () => {
    const reviewsIncluding2Approvals = [
      ...reviews,
      {
        state: 'APPROVED',
        author_association: 'OWNER',
        id: 7,
        user: { login: 'reitermarkus' },
        submitted_at: '2020-09-05T19:15:02Z',
        commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
      },
      {
        state: 'APPROVED',
        author_association: 'MEMBER',
        id: 8,
        user: { login: 'member1' },
        submitted_at: '2020-09-05T22:15:02Z',
        commit_id: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
      },
    ]

    expect(commitHasMinimumApprovals(reviewsIncluding2Approvals, reviewAuthorAssociations, commit, 0)).toBe(
      true
    )
    expect(commitHasMinimumApprovals(reviewsIncluding2Approvals, reviewAuthorAssociations, commit, 1)).toBe(
      true
    )
    expect(commitHasMinimumApprovals(reviewsIncluding2Approvals, reviewAuthorAssociations, commit, 2)).toBe(
      true
    )
    expect(commitHasMinimumApprovals(reviewsIncluding2Approvals, reviewAuthorAssociations, commit, 3)).toBe(
      false
    )
  })
})
