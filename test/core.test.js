import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveCommit, git } from '../src/adapters/git.js';
import { configuration } from '../src/core/validation.js';
import { fixture, manager, fakeWeb, settled, png } from './helpers.js';

test('resolves exact commits; rejects invalid/option refs and keeps source changes intact', async t => {
  const { root, repo, config } = await fixture(t);
  const sha = await resolveCommit(repo, 'HEAD');
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.notEqual(sha, await resolveCommit(repo, 'HEAD~1'));
  await assert.rejects(resolveCommit(repo, '--help'));
  await assert.rejects(resolveCommit(repo, 'missing'));
  await writeFile(path.join(repo, 'app.txt'), 'uncommitted');
  await writeFile(path.join(repo, 'personal.txt'), 'keep');
  const before = await git(['-C', repo, 'status', '--porcelain']);
  const m = await manager(root, fakeWeb());
  const s = await settled(m, await m.create(config));
  assert.equal(s.status, 'running');
  assert.equal(s.targets.right.sha, sha);
  assert.equal(await readFile(path.join(s.targets.left.worktree, 'app.txt'), 'utf8'), 'first');
  assert.equal(await readFile(path.join(s.targets.right.worktree, 'app.txt'), 'utf8'), 'second');
  await assert.rejects(m.create(config), /Stop the current/);
  await m.stop(s.id);
  assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
  assert.equal(await git(['-C', repo, 'status', '--porcelain']), before);
  assert.equal(await readFile(path.join(repo, 'app.txt'), 'utf8'), 'uncommitted');
  assert.equal(await readFile(path.join(repo, 'personal.txt'), 'utf8'), 'keep');
});

test('invalid commit and partial launch failure clean both worktrees and containers', async t => {
  const { root, config } = await fixture(t);
  const web = fakeWeb({ async start(record, side, signal) {
    if (side === 'right') throw new Error('install failed');
    await delay(10000, undefined, { signal });
  } });
  const m = await manager(root, web);
  const invalid = await settled(m, await m.create({ ...config, rightRef: 'missing' }));
  assert.equal(invalid.status, 'failed'); assert.match(invalid.error, /git failed/);
  const s = await settled(m, await m.create(config));
  assert.equal(s.status, 'failed');
  assert.match(s.error, /install failed/);
  assert.ok(web.calls.includes(`stop:${s.id}`));
  assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
});

test('stop during startup waits for launch completion and removes owned worktrees', async t => {
  const { root, config } = await fixture(t);
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const web = fakeWeb({ async start(record, side, signal) { started(); await delay(10000, undefined, { signal }); } });
  const m = await manager(root, web), s = await m.create(config);
  await ready; await m.stop(s.id);
  assert.equal(s.status, 'stopped'); assert.equal(m.jobs.size, 0);
  assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
});

test('feedback retains exact commit, snapshot, geometry and context after reopening; rejects bad data', async t => {
  const { root, config } = await fixture(t);
  const m = await manager(root, fakeWeb()), s = await settled(m, await m.create(config));
  const input = { side: 'left', screenshot: png, width: 1, height: 1, comment: 'Change this', annotations: ['pen', 'region', 'arrow'].map(tool => ({ tool, points: [[.1, .2], [.8, .9]] })) };
  const saved = await m.feedback(s.id, input);
  assert.equal(saved.sourceCommit, s.targets.left.sha);
  await assert.rejects(m.feedback(s.id, { ...input, side: 'other' }));
  await assert.rejects(m.feedback(s.id, { ...input, annotations: [{ tool: 'pen', points: [[-1, 2]] }] }));
  await assert.rejects(m.feedback(s.id, { ...input, screenshot: 'data:image/svg+xml,evil' }));
  await assert.rejects(m.feedback(s.id, { ...input, width: 100 }), /PNG header/);
  await m.stop(s.id);
  const reopened = await manager(root, fakeWeb()); await reopened.recover();
  assert.deepEqual(await reopened.store.feedback(saved.id), saved);
  assert.equal((await reopened.store.feedbackList())[0].screenshot, undefined);
  assert.equal(reopened.get(s.id).status, 'stopped');
});

test('restart recovers interrupted sessions, with cleanup failure retaining data for retry', async t => {
  const { root, config } = await fixture(t);
  const m = await manager(root, fakeWeb()), s = await settled(m, await m.create(config));
  const failing = await manager(root, fakeWeb({ async stop() { throw new Error('Docker unavailable'); } }));
  await assert.rejects(failing.recover(), /Docker unavailable/);
  assert.equal(await readFile(path.join(s.targets.left.worktree, 'app.txt'), 'utf8'), 'first');
  const recovered = await manager(root, fakeWeb()); await recovered.recover();
  assert.equal(recovered.get(s.id).status, 'stopped');
  assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
});

test('runtime exit stops both apps; failed cleanup blocks another launch until retried', async t => {
  const { root, config } = await fixture(t);
  const web = fakeWeb(), m = await manager(root, web), s = await settled(m, await m.create(config));
  web.healthy = async () => false;
  web.stop = async () => { throw new Error('Docker offline'); };
  await m.check(); assert.equal(s.status, 'cleanup-failed');
  await assert.rejects(m.create(config), /Stop the current/);
  web.stop = async () => {};
  await m.stop(s.id); assert.equal(s.status, 'stopped');
  const second = await settled(m, await m.create(config));
  await m.check(); assert.equal(second.status, 'failed');
});

test('launch configuration rejects malformed values and conflicting host ports', () => {
  const base = { repository: '/tmp/repo' };
  for (const patch of [{ port: 80 }, { image: '--privileged' }, { readyPath: '//elsewhere/' }, { timeout: 0 }, { leftPort: 4100, rightPort: 4100 }, { start: '' }]) assert.throws(() => configuration({ ...base, ...patch }));
});

test('shutdown waits for an in-flight session creation and cancels its launch', async t => {
  const { root, config } = await fixture(t), m = await manager(root, fakeWeb());
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const journal = new Promise(resolve => { entered = resolve; });
  const save = m.store.saveSession.bind(m.store);
  let first = true;
  m.store.saveSession = async record => {
    if (first) { first = false; entered(); await gate; }
    return save(record);
  };
  const creating = m.create(config); await journal;
  const closing = m.close(); release();
  const record = await creating; await closing;
  assert.equal(record.status, 'stopped'); assert.equal(m.jobs.size, 0);
  assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
  await assert.rejects(m.create(config), /shutting down/);
});
