import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { git } from '../src/adapters/git.js';
import { Store } from '../src/adapters/store.js';
import { GitRepository } from '../src/adapters/git.js';
import { Sessions } from '../src/core/sessions.js';
export const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ngAAAAAASUVORK5CYII=';
export async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitarena-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'source');
  await mkdir(repo); await git(['init', repo]);
  await git(['-C', repo, 'config', 'user.name', 'Test']);
  await git(['-C', repo, 'config', 'user.email', 'test@localhost']);
  await writeFile(path.join(repo, 'app.txt'), 'first');
  await git(['-C', repo, 'add', '.']); await git(['-C', repo, 'commit', '-m', 'First']);
  await writeFile(path.join(repo, 'app.txt'), 'second'); await git(['-C', repo, 'commit', '-am', 'Second']);
  const config = { repository: repo, leftRef: 'HEAD~1', rightRef: 'HEAD', install: 'true', start: 'node server.cjs' };
  return { root, repo, config };
}
export async function manager(root, web) {
  const store = new Store(path.join(root, 'data')); await store.init();
  const repository = new GitRepository(path.join(store.root, 'work'));
  return new Sessions({ store, repository, web, newId: randomUUID });
}
export function fakeWeb(overrides = {}) {
  const calls = [];
  return { calls, async start(record, side) { calls.push(`start:${side}`); return { url: `http://127.0.0.1:${side === 'left' ? 4501 : 4502}` }; }, async stop(id) { calls.push(`stop:${id}`); }, async healthy() { return true; }, ...overrides };
}
export async function settled(manager, record) { await manager.jobs.get(record.id); return manager.get(record.id); }
