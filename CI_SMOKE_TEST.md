# CI smoke test (throwaway)

This file exists only to open a test Pull Request that exercises the full
required-checks pipeline on the `pull_request` event — in particular the
`dependency-review` job, which only runs on PRs and was previously failing
because the repository's Dependency graph was disabled.

It changes no dependencies and no application code, so the PR should reach
**8/8 green** checks (`api`, `web`, `api-integration`, `audit`, `codeql`,
`dependency-review`, `gitleaks`, `docker`).

**Safe to close without merging** — delete the branch afterwards.
