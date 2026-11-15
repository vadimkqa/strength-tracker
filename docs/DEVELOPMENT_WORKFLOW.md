# GitHub development and deployment

Use a feature branch, open a PR, and let GitHub enforce these three checks:

- `build`: workflow safeguards, unit tests, TypeScript and Vite production build.
- `mobile (chromium)`: the complete browser suite against that production build.
- `mobile (webkit)`: the iPhone keyboard/import/reordering/navigation regression suite against the same build.

One **Deploy GitHub Pages** workflow runs all three jobs on PRs and `main`. Pages publishes only from `main` after all three succeed. Failed browser artifacts are retained for seven days. PRs never deploy. The existing `/strength-tracker/` production path, offline caching and application data are unchanged.

The former policy/attestation checks and automatic-enabler bot are removed. No SHA approval form, special labels, personal access token, repository variable or workflow dispatch is needed to merge. Historical failed policy runs remain in Actions history; they are not new required checks.

## Required administrator setup

At inspection, `main` was unprotected and the connected integration could not access administrative settings. **Do not enable unattended merging until the following rule is saved and verified.**

Repository **Settings → Branches → Add classic branch protection rule** (or edit the existing `main` rule):

1. Branch name pattern: `main`.
2. Enable **Require a pull request before merging**. Do not require an approving review on every PR if low-risk personal-project changes should auto-merge without another reviewer.
3. Enable **Require status checks to pass before merging** and **Require branches to be up to date before merging**. Require GitHub Actions checks **`build`**, **`mobile (chromium)`**, **`mobile (webkit)`**. Remove `Merge policy` or `policy` from the required list if previously selected; replace them with the real tests, not an empty required list.
4. Enable **Do not allow bypassing the above settings**. Leave bypass actors, force pushes and branch deletion disabled. Save.

All three names already exist from the mobile CI runs. If a name is not offered, wait for the simplification PR's workflow to finish and return to the rule. Keep **Settings → General → Pull Requests → Allow squash merging / Allow auto-merge** enabled (already enabled at inspection). Keep **Settings → Pages → Source: GitHub Actions** (already configured). No new token or automation variable is required. Old bot-only secrets/variables become unused when its workflow is removed; they are not used by this workflow.

Before enabling native auto-merge on any future PR, verify the branch reports protection enabled and all three checks required. If this cannot be verified, leave the PR open for manual merging after reviewing its tests. Native branch protection enforces tests; deciding which changes need manual review is the development process in `AGENTS.md`, not a custom check.

## Each update

```sh
npm ci
npm run test:workflow
npm test
npm run build
npm run test:e2e
# Where Playwright WebKit is installed:
REGRESSION_BROWSER=webkit npx playwright test --config playwright.regression.config.ts
```

CI uses Node 24 and Playwright-managed browsers on Ubuntu 24.04. Local Chromium retains `/usr/bin/chromium` or `CHROMIUM_PATH`. Physical iPhone Safari/PWA smoke testing remains necessary for native keyboard/compositor behavior.

For a completed **low-risk** update, Codex creates a PR and, after confirming enforced protection, can select **Enable auto-merge → Squash and merge**. GitHub waits for required checks and other repository rules. A queued request is not a completed merge. Native merges made by the user's GitHub identity trigger the ordinary main push and Pages deployment; no bot token is involved.

For **high-risk** data migrations, destructive operations, saved-history/backup/streak changes or workflow governance, leave the PR unqueued for human review. The owner reviews the diff and test results, then uses the normal **Squash and merge → Confirm squash and merge** controls after required checks pass. Do not fabricate GitHub approvals, bypass protections or use administrator overrides. Tests failing, conflicts or missing permissions mean the PR stays open.

## Merging this simplification PR

This governance change requires manual review. After its build and both mobile checks are green, set/verify the rule above, then use normal **Squash and merge**. No old policy attestation or failed-job rerun is needed: the old `policy` job is not one of the required tests. If an old rule requires the retired custom context, replace only that obsolete context with the three real test contexts before merging; keep the PR requirement and no-bypass enforcement intact.

The old main-branch policy workflow may still create a red check on this bootstrap PR until the deletion reaches `main`. Existing runs are historical; do not rerun them. After merging, future PRs receive only the real testing workflow. Confirm **Deploy GitHub Pages → build, mobile, deploy** succeeds after the main push. No production storage reset or plan reimport is needed.
