const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const workflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const build = workflow.split('  build:\n')[1].split('  mobile:\n')[0];
const mobile = workflow.split('  mobile:\n')[1].split('  deploy:\n')[0];
const deploy = workflow.split('  deploy:\n')[1];

test('production build retains workflow tests, unit tests and TypeScript checking', () => {
  assert.match(build, /run: npm ci/);
  assert.match(build, /run: npm run test:workflow/);
  assert.match(build, /run: npm test\s/);
  assert.match(build, /run: npm run build/);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts.build, /tsc --noEmit && vite build/);
  assert.equal(
    pkg.scripts['test:workflow'],
    'node --test --test-isolation=none scripts/workflow.test.cjs',
  );
});

test('both mobile engines test the exact production artifact with failure artifacts retained', () => {
  assert.match(build, /name: production-dist\n\s+path: dist\//);
  assert.match(mobile, /needs: build/);
  assert.match(mobile, /browser: \[chromium, webkit\]/);
  assert.match(
    mobile,
    /uses: actions\/download-artifact@v4\n\s+with:\n\s+name: production-dist\n\s+path: dist\//,
  );
  assert.match(mobile, /playwright install --with-deps \$\{\{ matrix.browser \}\}/);
  assert.match(mobile, /run: npx playwright test --config playwright.regression.config.ts/);
  assert.match(mobile, /REGRESSION_BROWSER: \$\{\{ matrix.browser \}\}/);
  assert.match(mobile, /if: failure\(\)/);
  const config = fs.readFileSync('playwright.regression.config.ts', 'utf8');
  assert.match(config, /process.env.REGRESSION_BROWSER === 'webkit' \? 'webkit' : 'chromium'/);
  assert.match(config, /mobile-reliability.spec.ts/);
  assert.match(config, /set-input-navigation.spec.ts/);
  assert.match(config, /: undefined/); // Chromium retains the entire suite, not the WebKit subset.
});

test('Pages can publish only main and only after build AND mobile succeed', () => {
  const mainOnly = "if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'";
  assert.ok(build.includes(mainOnly));
  assert.ok(deploy.includes(mainOnly));
  assert.match(deploy, /needs: \[build, mobile\]/);
  assert.doesNotMatch(deploy, /always\(|continue-on-error/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.match(deploy, /uses: actions\/deploy-pages@v4/);
  assert.match(deploy, /environment:\n\s+name: github-pages/);
});

test('PR CI is read-only and contains no privileged PR execution or merge mutation', () => {
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(
    build + mobile,
    /permissions:|secrets\.|checks: write|pull-requests: write|contents: write/,
  );
  assert.doesNotMatch(
    workflow,
    /pull_request_target|workflow_run|enablePullRequestAutoMerge|mergePullRequest|gh pr merge|github-script/,
  );
  assert.match(deploy, /pages: write\n\s+id-token: write/);
});

test('obsolete custom policy, attestation and merge-bot entry points are removed', () => {
  for (const path of [
    '.github/workflows/merge-policy.yml',
    '.github/workflows/auto-merge.yml',
    '.github/workflows/mobile-regressions.yml',
    'scripts/automation/review.cjs',
    'scripts/automation/policy.cjs',
    'scripts/automation/auto-merge.cjs',
    'scripts/automation/policy.test.cjs',
  ])
    assert.equal(fs.existsSync(path), false, path);
  assert.doesNotMatch(workflow, /AUTO_MERGE_TOKEN|ENABLE_GUARDED_AUTO_MERGE|head_sha|reviewed:/);
});

test('agent instructions keep native auto-merge gated by protection and data-risk review', () => {
  const instructions = fs.readFileSync('AGENTS.md', 'utf8');
  for (const name of ['build', 'mobile (chromium)', 'mobile (webkit)'])
    assert.ok(instructions.includes('`' + name + '`'));
  assert.match(instructions, /Never queue auto-merge while protection is missing or unverifiable/);
  assert.match(instructions, /Data migrations, destructive changes/);
  assert.match(instructions, /do not enable auto-merge/);
  assert.match(instructions, /Do not merge this workflow-simplification PR automatically/);
});
