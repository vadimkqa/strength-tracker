const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { classifyFiles, autoMergeBlock, latestReviews, validAttestation } = require('./policy.cjs');
const { run: autoRun } = require('./auto-merge.cjs');
const { run: reviewRun } = require('./review.cjs');
const sha = 'a'.repeat(40),
  base = 'b'.repeat(40);
const file = (filename, extra = {}) => ({
  filename,
  status: 'modified',
  patch: '@@\n-old heading\n+new heading',
  ...extra,
});
const check = (name, id = 1) => ({
  name,
  id,
  head_sha: sha,
  app: { slug: 'github-actions' },
  status: 'completed',
  conclusion: 'success',
});
function eligible() {
  return {
    pull: {
      number: 10,
      node_id: 'PR_10',
      state: 'open',
      draft: false,
      changed_files: 1,
      labels: [{ name: 'auto-merge' }],
      base: { ref: 'main' },
      head: { sha, repo: { full_name: 'owner/repo' } },
      mergeable: true,
      mergeable_state: 'clean',
      user: { login: 'author' },
    },
    repo: {
      full_name: 'owner/repo',
      default_branch: 'main',
      allow_auto_merge: true,
      allow_squash_merge: true,
    },
    branch: {
      protected: true,
      protection: { required_status_checks: { contexts: ['build', 'Merge policy'] } },
    },
    files: [file('src/style.css')],
    checks: [check('build'), check('Merge policy', 2)],
  };
}
test('presentation, docs, test additions and original PNG assets are eligible', () => {
  for (const path of [
    'src/style.css',
    'src/ui/Card.tsx',
    'src/WorkoutCarousel.tsx',
    'docs/design.md',
    'README.md',
    'tests/cards.spec.ts',
    'public/photos/bench.jpg',
    'public/streak-achievements/01.PNG',
  ])
    assert.equal(classifyFiles([file(path)]).manual, false, path);
});
test('storage/history/streak/backup/governance logic and unknown modules always require review', () => {
  for (const path of [
    'src/data.ts',
    'src/streak.ts',
    'src/streak-storage.ts',
    'src/backup.ts',
    'src/history-editor.ts',
    'src/migrations/v4.ts',
    'src/importing/model.ts',
    'src/WorkoutCompletion.tsx',
    'src/ExerciseCard.tsx',
    'src/main.tsx',
    'scripts/automation/policy.cjs',
    '.github/workflows/deploy-pages.yml',
    'AGENTS.md',
    'package.json',
    'package-lock.json',
    'playwright.config.ts',
    'vite.config.ts',
    'public/sw.js',
    'public/manifest.webmanifest',
    'public/new.svg',
    'src/new-calculation.ts',
  ])
    assert.equal(classifyFiles([file(path)]).manual, true, path);
});
test('renames, unknown/truncated component patches, source/test removals and incomplete file lists fail closed', () => {
  assert.equal(
    classifyFiles([file('src/ui/Card.tsx', { previous_filename: 'src/data.ts' })]).manual,
    true,
  );
  assert.equal(classifyFiles([file('src/ui/Card.tsx', { patch: undefined })]).manual, true);
  assert.equal(classifyFiles([file('src/ui/Card.tsx', { status: 'removed' })]).manual, true);
  assert.equal(classifyFiles([file('tests/data.spec.ts', { status: 'removed' })]).manual, true);
  assert.equal(classifyFiles([file('src/style.css')], 2).manual, true);
  assert.equal(classifyFiles([], 0).manual, true);
  assert.equal(
    classifyFiles([file('src/ui/Card.tsx', { patch: '+window.localStorage.clear()' })]).manual,
    true,
  );
  assert.equal(
    classifyFiles([file('src/ui/Card.tsx', { patch: '+data.history = []' })]).manual,
    true,
  );
});
test('auto-merge requires both required checks on protected main and a current-head success', () => {
  assert.equal(autoMergeBlock(eligible()), null);
  for (const alter of [
    (x) => (x.branch.protected = false),
    (x) => (x.branch.protection.required_status_checks.contexts = ['build']),
    (x) => (x.checks[0].head_sha = base),
    (x) => (x.checks[0].conclusion = 'failure'),
    (x) => (x.checks[0].status = 'in_progress'),
    (x) => (x.checks[0].app.slug = 'other-app'),
    (x) => x.checks.push({ ...check('build', 99), conclusion: 'failure' }),
    (x) => x.checks.push({ ...check('external-check', 99), conclusion: 'cancelled' }),
    (x) => (x.pull.mergeable = false),
    (x) => (x.pull.mergeable = null),
    (x) => (x.pull.mergeable_state = 'behind'),
    (x) => (x.pull.mergeable_state = 'blocked'),
    (x) => (x.pull.labels = []),
    (x) => x.pull.labels.push({ name: 'do-not-merge' }),
    (x) => (x.pull.draft = true),
    (x) => (x.pull.head.repo.full_name = 'fork/repo'),
    (x) => (x.repo.allow_auto_merge = false),
    (x) => (x.repo.allow_squash_merge = false),
    (x) => (x.pull.base.ref = 'other'),
    (x) => (x.files = [file('src/streak.ts')]),
  ]) {
    const x = eligible();
    alter(x);
    assert.notEqual(autoMergeBlock(x), null);
  }
  const retried = eligible();
  retried.checks.unshift({ ...check('build', 0), conclusion: 'failure' });
  assert.equal(autoMergeBlock(retried), null);
});
test('manual attestation binds a human review to the exact current head; comments cannot clear requested changes', () => {
  assert.equal(validAttestation({ reviewed: true, head_sha: sha }, eligible().pull), true);
  assert.equal(validAttestation({ reviewed: false, head_sha: sha }, eligible().pull), false);
  assert.equal(validAttestation({ reviewed: true, head_sha: base }, eligible().pull), false);
  const user = { login: 'reviewer' };
  assert.equal(
    latestReviews([
      { id: 1, user, state: 'CHANGES_REQUESTED' },
      { id: 2, user, state: 'COMMENTED' },
    ])[0].state,
    'CHANGES_REQUESTED',
  );
  assert.equal(
    latestReviews([
      { id: 1, user, state: 'APPROVED' },
      { id: 2, user, state: 'DISMISSED' },
    ])[0].state,
    'DISMISSED',
  );
});
function mock(x = eligible()) {
  const mutations = [],
    posted = [],
    notices = [];
  const pulls = {
    get: async () => ({ data: x.pull }),
    listFiles: function files() {},
    listReviews: function reviews() {},
  };
  const checks = {
    listForRef: function checks() {},
    create: async (check) => {
      posted.push(check);
    },
  };
  const github = {
    rest: {
      pulls,
      checks,
      repos: {
        get: async () => ({ data: x.repo }),
        getBranch: async () => ({ data: x.branch }),
        listPullRequestsAssociatedWithCommit: function associated() {},
        getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }),
      },
      users: { getByUsername: async () => ({ data: { type: 'User' } }) },
    },
    paginate: async (method, params, map) => {
      // Octokit normalizes check_runs/search namespaces into arrays before map callbacks.
      const data =
        method === pulls.listFiles
          ? x.files
          : method === checks.listForRef
            ? x.checks
            : method === github.rest.repos.listPullRequestsAssociatedWithCommit
              ? x.associated || []
              : x.reviews || [];
      return map ? map({ data }) : data;
    },
    graphql: async (query, args) => {
      mutations.push({ query, args });
    },
  };
  const core = {
    notice: (m) => notices.push(m),
    warning: (m) => notices.push(m),
    setFailed: (m) => notices.push(m),
    summary: {
      addHeading() {
        return this;
      },
      addRaw() {
        return this;
      },
      addList() {
        return this;
      },
      async write() {},
    },
  };
  const context = {
    repo: { owner: 'owner', repo: 'repo' },
    actor: 'maintainer',
    eventName: 'workflow_run',
    serverUrl: 'https://github.com',
    runId: 1,
    payload: {
      workflow_run: {
        name: 'Deploy GitHub Pages',
        event: 'pull_request',
        conclusion: 'success',
        head_sha: sha,
        pull_requests: [{ number: 10 }],
      },
    },
  };
  return { github, core, context, mutations, posted, notices, enabled: 'true' };
}
test('only eligible opt-in PRs receive the native enable-auto-merge mutation, never a direct/force merge', async () => {
  const m = mock();
  await autoRun(m);
  assert.equal(m.mutations.length, 1);
  assert.match(m.mutations[0].query, /enablePullRequestAutoMerge/);
  assert.match(m.mutations[0].query, /SQUASH/);
  assert.doesNotMatch(m.mutations[0].query, /mergePullRequest\(/);
  assert.deepEqual(m.mutations[0].args, { id: 'PR_10' });
});
test('disabled config, existing unlabelled PRs, failed/stale runs, conflicts, sensitive changes and API denial never merge', async () => {
  const disabled = mock();
  disabled.enabled = 'false';
  await autoRun(disabled);
  assert.equal(disabled.mutations.length, 0);
  for (const alter of [
    (m, x) => (x.pull.labels = []),
    (m, x) => (x.pull.mergeable = false),
    (m, x) => (x.files = [file('src/backup.ts')]),
    (m) => (m.context.payload.workflow_run.conclusion = 'failure'),
    (m) => (m.context.payload.workflow_run.head_sha = base),
    (m) => (m.context.payload.workflow_run.pull_requests = []),
    (m) =>
      (m.github.rest.repos.getBranch = async () => {
        throw Error('403 permission denied');
      }),
  ]) {
    const x = eligible(),
      m = mock(x);
    alter(m, x);
    await autoRun(m);
    assert.equal(m.mutations.length, 0);
    assert.ok(m.notices.length);
  }
});
test('a changed PR during the final reread is left open', async () => {
  const m = mock();
  let n = 0;
  m.github.rest.pulls.get = async () => ({
    data: ++n === 1 ? eligible().pull : { ...eligible().pull, head: { sha: base } },
  });
  await autoRun(m);
  assert.equal(m.mutations.length, 0);
  assert.match(m.notices.join(' '), /changed/);
});
test('sensitive policy fails without review and permits explicit human attestation without merging', async () => {
  const x = eligible();
  x.files = [file('src/streak.ts')];
  const m = mock(x);
  m.context.eventName = 'pull_request_target';
  m.context.payload = { pull_request: { number: 10 } };
  await reviewRun(m);
  assert.equal(m.posted[0].conclusion, 'failure');
  assert.equal(m.mutations.length, 0);
  m.context.eventName = 'workflow_dispatch';
  m.context.payload = { inputs: { pr: '10', head_sha: sha, reviewed: 'true' } };
  await reviewRun(m);
  assert.equal(m.posted[1].conclusion, 'success');
  assert.match(m.posted[1].external_id, /manual-review:10:/);
  assert.equal(m.mutations.length, 0);
});
test('bots, read-only actors, stale approvals, requested changes and stale attestation cannot approve sensitive logic', async () => {
  for (const alter of [
    (m) => (m.github.rest.users.getByUsername = async () => ({ data: { type: 'Bot' } })),
    (m) =>
      (m.github.rest.repos.getCollaboratorPermissionLevel = async () => ({
        data: { permission: 'read' },
      })),
    (m) => (m.context.payload.inputs.head_sha = base),
    (m, x) =>
      (x.reviews = [
        {
          id: 1,
          state: 'CHANGES_REQUESTED',
          user: { login: 'other', type: 'User' },
          commit_id: sha,
        },
      ]),
  ]) {
    const x = eligible();
    x.files = [file('src/backup.ts')];
    const m = mock(x);
    m.context.eventName = 'workflow_dispatch';
    m.context.payload = { inputs: { pr: '10', head_sha: sha, reviewed: 'true' } };
    alter(m, x);
    await reviewRun(m);
    assert.equal(m.posted[0].conclusion, 'failure');
    assert.equal(m.mutations.length, 0);
  }
});
test('current human approval is accepted; dismissed or old-head approval is not', async () => {
  for (const [state, commit, success] of [
    ['APPROVED', sha, true],
    ['APPROVED', base, false],
    ['DISMISSED', sha, false],
  ]) {
    const x = eligible();
    x.files = [file('src/data.ts')];
    x.reviews = [{ id: 1, state, user: { login: 'reviewer', type: 'User' }, commit_id: commit }];
    const m = mock(x);
    m.context.eventName = 'pull_request_target';
    m.context.payload = { pull_request: { number: 10 } };
    await reviewRun(m);
    assert.equal(m.posted[0].conclusion, success ? 'success' : 'failure');
  }
});
test('workflow source uses trusted checkout, opt-in token, readonly PR CI, and main-only Pages deployment', () => {
  const policy = fs.readFileSync('.github/workflows/merge-policy.yml', 'utf8');
  const auto = fs.readFileSync('.github/workflows/auto-merge.yml', 'utf8');
  const ci = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
  assert.match(policy, /pull_request_target:/);
  assert.match(policy, /ref: \$\{\{ github.workflow_sha \}\}/);
  assert.doesNotMatch(policy, /head\.sha|npm ci|npm run/);
  assert.match(auto, /ENABLE_GUARDED_AUTO_MERGE/);
  assert.match(auto, /github-token: \$\{\{ secrets.AUTO_MERGE_TOKEN \}\}/);
  assert.match(auto, /ref: \$\{\{ github.workflow_sha \}\}/);
  assert.match(ci, /permissions:\n  contents: read/);
  assert.match(ci, /npm run test:workflow/);
  assert.match(ci, /npm run test:e2e/);
  assert.match(ci, /npx playwright install --with-deps chromium/);
  assert.match(
    ci,
    /deploy:\n    if: github.event_name != 'pull_request' && github.ref == 'refs\/heads\/main'/,
  );
});

test('maintainer attestation survives a rerun only on its original head, never after a new push', async () => {
  const x = eligible();
  x.files = [file('src/data.ts')];
  x.checks.push({
    ...check('Merge policy', 100),
    external_id: `manual-review:10:${sha}:maintainer`,
  });
  const m = mock(x);
  m.context.eventName = 'pull_request_target';
  m.context.payload = { pull_request: { number: 10 } };
  await reviewRun(m);
  assert.equal(m.posted[0].conclusion, 'success');
  x.pull.head.sha = base;
  await reviewRun(m);
  assert.equal(m.posted[1].conclusion, 'failure');
  assert.equal(m.mutations.length, 0);
});

test('empty run metadata recovers only the open PR attached to the exact tested commit', async () => {
  const x = eligible(),
    m = mock(x);
  m.context.payload.workflow_run.pull_requests = [];
  x.associated = [
    x.pull,
    { ...x.pull, number: 20, state: 'closed' },
    { ...x.pull, number: 30, head: { sha: base } },
  ];
  await autoRun(m);
  assert.equal(m.mutations.length, 1);
  assert.deepEqual(m.mutations[0].args, { id: 'PR_10' });
});
test('trusted policy workflow can invoke the same guarded enabler after its check completes', async () => {
  const m = mock();
  m.context.eventName = 'pull_request_target';
  m.context.payload = { pull_request: { number: 10 } };
  m.requestedPR = '10';
  await autoRun(m);
  assert.equal(m.mutations.length, 1);
  const blocked = mock();
  blocked.requestedPR = '10;echo bad';
  await assert.rejects(autoRun(blocked), /valid PR number/);
  assert.equal(blocked.mutations.length, 0);
});
