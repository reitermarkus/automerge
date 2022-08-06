<p align="center">
  <a href="https://github.com/reitermarkus/automerge/actions"><img alt="automerge build-test status" src="https://github.com/reitermarkus/automerge/workflows/build-test/badge.svg"></a>
</p>

# Automerge Action

This action automatically enables “auto-merge” for pull requests under the following conditions:

- The pull request is not a draft.
- The associated branch has at least one required status check.
- All required labels are applied.
- No “do not merge” labels are applied.

Ensure the following is set up in your repository settings before enabling this action:

- The **“Require pull request reviews before merging”** rule and the additional **“Dismiss stale pull request approvals when new commits are pushed”** rule
  are enabled for the branch. This ensures that no changes to the pull request are possible between the approval and the automatic merging.

- The **“Require status checks to pass before merging”** rule is enabled and at least one status check is selected.

  Consider also adding this action as an additional required status check. Read the [Known Issues](#known-issues) section on why.

- **“Allow auto-merge”** is enabled.

## Inputs

| Name                               | Required | Description                                                                                                                                     |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`                            | yes      | A GitHub Token other than the default `GITHUB_TOKEN` needs to be specified in order to be able to enable auto-merge.                            |
| `merge-method`                     | no       | Specify which merge method to use. By default, will select the first one available in this order: `merge`, `squash`, `rebase`                   |
| `squash-title`                     | no       | (deprecated) Use the pull request title as the commit message when squashing. Prefer setting `sqaush-commit-title` and `squash-commit-message`. |
| `squash-commit-title`              | no       | Set the squash commit title to the supplied string. Available template variables include `${pull_request.title}` and `${pull_request.number}`.  |
| `squash-commit-message`            | no       | Set the squash commit body to the supplied string. Available template variables include `${pull_request.body}`.                                 |
| `do-not-merge-labels`              | no       | When any of the labels in this comma-separated list is applied to a pull request, it will not be merged automatically.                          |
| `required-labels`                  | no       | Comma-separated list of labels that are required to be applied to a pull request for it to be merged automatically.                             |
| `pull-request`                     | no       | Try merging the specified pull request automatically. For example, you can pass an input from a `workflow_dispatch` event.                      |
| `pull-request-author-associations` | no       | Comma-separated list of required author associations for the pull request author. (By default, pull requests by any author are allowed.)        |
| `dry-run`                          | no       | If set to `true`, will not actually merge pull requests but still perform all other checks.                                                     |

## Example Workflow

```yml
name: Automerge

on:
  # Try enabling auto-merge for all open pull requests. (Only recommended for testing.)
  push:

  # Try enabling auto-merge for all open pull requests.
  schedule:
    - cron: 0 * * * *

  # Try enabling auto-merge for a pull request when a draft is marked as “ready for review”, when
  # a required label is applied or when a “do not merge” label is removed, or when a pull request
  # is updated in any way (opened, synchronized, reopened, edited).
  pull_request_target:
    types:
      - opened
      - synchronized
      - reopened
      - edited
      - labeled
      - unlabeled
      - ready_for_review

  # Try enabling auto-merge for the specified pull request or all open pull requests if none is specified.
  workflow_dispatch:
    inputs:
      pull-request:
        description: Pull Request Number
        required: false

jobs:
  automerge:
    runs-on: ubuntu-latest
    steps:
      - uses: reitermarkus/automerge@v2
        with:
          token: ${{ secrets.MY_GITHUB_TOKEN }}
          merge-method: rebase
          do-not-merge-labels: never-merge
          required-labels: automerge
          pull-request: ${{ github.event.inputs.pull-request }}
          dry-run: true
```

## Known Issues

If the action is triggered via a label on a pull request that is already ready to merge, the GitHub auto-merge feature cannot be enabled on that pull request anymore. A workaround is to add the workflow containing this actions as a required status check. This way the pull request will become unmergable while the action is running, allowing auto-merge to be enabled.

27339
