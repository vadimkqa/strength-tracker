# Guarded automatic merging and Pages deployment

## Current inspection and activation state

At setup, repository auto-merge and squash merging were already enabled. `main` reported `protected: false`, with no required checks. No open PRs existed. Pages uses GitHub Actions and publishes to https://vadimkqa.github.io/strength-tracker/.

The connected integration was denied the administrative branch-protection, GraphQL protection-rule and Actions-permission endpoints (`403 Resource not accessible by integration`), despite repository metadata reporting an admin user role. It cannot establish those administrative protections. Auto-merge therefore remains inactive until an administrator completes the steps below. The `auto-merge` and `do-not-merge` labels were created without applying either to a PR. No existing PR is opted in and the bootstrap PR is not auto-merged.

## One-time GitHub setup (administrator)

1. **Manually review and merge the workflow setup PR** after its `build` check succeeds. This bootstraps the trusted workflows on `main`. Do not opt it in to auto-merge. Its workflow/governance changes require human review.
2. Open **Repository → Settings → Branches → Add classic branch protection rule**. Pattern: `main`. Select **Require a pull request before merging**, **Require status checks to pass before merging**, and **Require branches to be up to date before merging**. Require both **`build`** and **`Merge policy`** from GitHub Actions. Enable **Do not allow bypassing the above settings** (including administrators). Keep force pushes and branch deletion disabled; do not add bypass actors. Apply/save the rule.
   - If `Merge policy` is not offered yet, require `build` immediately, then open a harmless documentation verification PR **without** the auto-merge label. Its trusted policy workflow registers the named check. Return to this rule and add `Merge policy` before activation. You can also dispatch **Actions → Merge policy → Run workflow**, select `main` and provide an **open PR number**, leaving review acknowledgement unchecked, to register/evaluate its check.
   - Do not require an approving review for *every* PR if low-risk UI changes should merge without review. The required `Merge policy` check enforces current-head human review for sensitive changes. You may require reviews globally for stricter protection; ordinary auto-merges then wait for those reviews too. Dismiss stale approvals when global required approvals are used.
3. **Settings → General → Pull Requests**: keep **Allow auto-merge** and **Allow squash merging** enabled. They were already enabled at inspection. Keep **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Create a **fine-grained personal access token** under your GitHub user **Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Resource owner: `vadimkqa`; repository access: **Only select repositories → strength-tracker**. Minimum repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Checks: Read-only**; Metadata read is implicit. Set an expiry and rotate it when needed. Do not grant administration/branch-protection permissions. Do not paste this token into chat, source files or PR comments.
5. Repository **Settings → Secrets and variables → Actions → Secrets → New repository secret**: name **`AUTO_MERGE_TOKEN`**, value the token above. Then **Variables → New repository variable**: name **`ENABLE_GUARDED_AUTO_MERGE`**, value **`true`**. Set the variable only after the branch rule is saved and both required checks are visible.
   - The dedicated user token lets the resulting merge trigger the existing main `push` deployment workflow. The automation deliberately does **not** fall back to `GITHUB_TOKEN`: events caused by that token can suppress subsequent workflows.
   - Leave automatic PR approvals disabled; this automation never approves PRs. If an organization policy prevents the requested check-writing permission or these actions, ask its administrator to allow the workflow. A permission failure leaves the PR open, rather than bypassing checks.
6. Ensure repository labels **`auto-merge`** and **`do-not-merge`** exist (create them under **Issues → Labels** if the integration could not). Opt in only **future, finished, eligible PRs** with `auto-merge`. Never bulk-label old unfinished PRs. A PR is merged only through GitHub's native guarded auto-merge; a queued request is not a completed deployment.

Classic branch protection is used because its required check contexts can be verified through the readable branch API. If your organization enforces equivalent rulesets but that endpoint does not expose both required contexts, the bot declines to merge; use manual merging or ask an administrator to adapt the verification in a reviewed PR.

## Per-update development

Use a feature branch, preserve existing work/data, and run:

```sh
npm ci
npm run test:workflow
npm test
npm run build        # TypeScript checking + Vite production build
npm run test:e2e     # relevant browser specs locally; all specs in CI
```

Node 24 is used in CI. CI installs Playwright Chromium and uses its managed executable; local development retains `/usr/bin/chromium` or `CHROMIUM_PATH`. The `build` check runs merge-policy tests, application unit tests, TypeScript/production build and all mobile browser tests. Failed browser artifacts are retained for seven days. Pages artifacts and deployment remain restricted to successful `main` runs; PRs do not deploy.

Create a PR. Eligible finished presentation/doc updates may receive `auto-merge`; the policy deliberately declines protected or ambiguous work. This includes migrations, backup/restore, history, streak calculations, persistence/controller/plan modules, dependency and workflow changes. Protected modules such as `src/main.tsx` contain both UI and persistence, so even a small change there needs review. Do not rename or move logic to evade the policy. Unsupported or missing diffs fail closed. Presentation components also receive a conservative scan for storage/history execution references.

The native auto-merge request is made only for an open, non-draft, same-repository PR into `main`, with the opt-in label, no hold, a complete low-risk file list, no conflicts/stale base, verified protection, and current-head successful `build` and `Merge policy` checks. Other repository requirements remain enforced by GitHub. Failures and permission errors are reported in the **Guarded auto-merge** Actions summary; nothing force-merges.

Only trusted default-branch workflow code is checked out by `pull_request_target` / `workflow_run`. Those privileged workflows never execute PR code, interpolate PR text into shell commands, or approve reviews. They write a policy check or enable native auto-merge; they never call a direct/force merge or change branch protection.

## Manual review for sensitive work

Do **not** add the auto-merge label. Inspect the changes and tests. Either:

- Another human maintainer with write/maintain/admin access approves the **current head commit**. Then rerun **Actions → Merge policy** for that PR (or dispatch it on `main` with its PR number). The check reads the current reviews; comments cannot clear requested changes, and old-head/dismissed reviews do not count.
- For a sole maintainer or a PR authored by your own account: **Actions → Merge policy → Run workflow → branch `main`**. Enter the PR number and its **full 40-character current head SHA**, and check **I personally reviewed the data-sensitive changes at this exact SHA** only after doing that review. This records an explicit maintainer attestation in the required check; it is not a fabricated GitHub approval. Get the full SHA from the PR's latest commit page, or `gh pr view NUMBER --json headRefOid --jq .headRefOid`.

A new commit invalidates an earlier attestation. Maintainer changes-requested reviews and `do-not-merge` holds block the gate. An ordinary comment does not revoke/approve anything. Remove the hold only after review. With the policy and all other required checks green, **manually merge** the sensitive PR using GitHub. Never bypass a failed required check. If your branch rule globally requires another person's approval, the attestation does not bypass that GitHub rule.

Approval does not automatically trigger a new trusted policy run; rerun/dispatch is intentional. Auto-merge is not enabled for sensitive changes even after review.

## Troubleshooting and stopping automation

- Missing variable/token/protection/checks: workflow reports the missing setup and leaves the PR unchanged. Follow the steps above. Do not remove the guard to get a merge.
- Missing PR association in a workflow-run event: the workflow first recovers only open PRs explicitly associated with that exact tested head commit. If GitHub exposes no such association, no PR is guessed or scanned. For an eligible new PR, run **Actions → Guarded auto-merge → Run workflow → main**, entering its number. All checks/labels/protection are revalidated.
- Failing tests, conflict, stale base, API/permission errors or an unknown merge state: leave the PR open and report the exact issue. Fix the branch normally and rerun checks; never force-merge. Check the Actions summary for the refusal reason.
- An expired token must be rotated in `AUTO_MERGE_TOKEN`; no anonymous/default-token fallback exists.
- To stop future enabling, set `ENABLE_GUARDED_AUTO_MERGE` to `false`. To cancel an already queued native merge, use **Disable auto-merge** on that PR. Removing a label or disabling the variable does not cancel a request GitHub already accepted.
- After a merge, confirm **Deploy GitHub Pages → build and deploy** succeeds and the PWA updates normally. This workflow changes no application storage or user data and does not reinstall/reimport plans.
