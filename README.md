<p align="center">
  <a href="https://github.com/reitermarkus/automerge/actions"><img alt="typescript-action status" src="https://github.com/reitermarkus/automerge/workflows/build-test/badge.svg"></a>
</p>

# Automerge Action

This action allows merging pull requests automatically if they have been approved and status checks have passed.
GitHub's branch protection rules are used to determine if auto-merging is allowed for a specific branch.

Auto-merging is enabled for a branch given the following criteria:

- The **Require pull request reviews before merging** rule and the additional **Dismiss stale pull request approvals when new commits are pushed** rule
  are enabled for the branch. This ensures that no changes to the pull request are possible between the approval and the automatic merging.

- The **Require status checks to pass before merging** rule is enabled and at least one status check is selected.


## Inputs

| Name | Required  | Description |
|------|-----------|-------------|
| `token` | yes | A GitHub Token other than the default `GITHUB_TOKEN` needs to be specified in order to be able to trigger other workflows. |
| `merge-method` | no | Specify which merge method to use. By default, will select the first one available in this order: `merge`, `squash`, `rebase` |
| `do-not-merge-labels` | no | When any of the labels in this comma-separated list is applied to a pull request, it will not be merged automatically. |
| `pull-request` | no | Try merging the specified pull request automatically. For example, you can pass an input from a `workflow_dispatch` event. |
| `dry-run` | no | If set to `true`, will not actually merge pull requests but still perform all other checks. |


## Example Workflow

```yml
name: Automerge

on:
  # Try merging all open pull requests. (Only recommended for testing.)
  push:

  # Try merging all open pull requests.
  schedule:
    - cron: 0 * * * *

  # Try merging pull requests belonging to a workflow run.
  workflow_run:
    workflows:
      - CI
    types:
      - completed

  # Try merging a pull request when it is approved.
  pull_request_review:
    types:
      - submitted

  # Try merging a pull request when a draft is marked as “ready for review.”
  pull_request_target:
    types:
      - ready_for_review

  # Try merging the specified pull request or all open pull requests if none is specified.
  workflow_dispatch:
    inputs:
      pull-request:
        description: Pull Request Number
        required: false

jobs:
  automerge:
    if: github.event.review.state == 'approved' || !github.event.review
    runs-on: ubuntu-latest
    steps:
      - uses: reitermarkus/automerge@v1
        with:
          token: ${{ secrets.MY_GITHUB_TOKEN }}
          merge-method: rebase
          do-not-merge-labels: never-merge
          pull-request: ${{ github.event.inputs.pull-request }}
          dry-run: true
```

23133
