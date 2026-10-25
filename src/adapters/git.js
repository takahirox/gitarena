import { realpath, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { command } from './process.js';
// Do not inherit host Git aliases, filters, hooks, credentials, or environment overrides.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
export const git = (args, options) => command('git', ['-c', 'core.hooksPath=/dev/null', ...args], { env, ...options });
export async function resolveCommit(repository, ref) {
  const sha = await git(['-C', repository, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`Could not resolve commit: ${ref}`);
  return sha;
}
export class GitRepository {
  constructor(root) { this.root = root; }
  directory(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid session ID.');
    return path.join(this.root, id);
  }
  async prepare(id, config, signal) {
    const repository = await realpath(config.repository);
    const [left, right] = await Promise.all([resolveCommit(repository, config.leftRef), resolveCommit(repository, config.rightRef)]);
    signal.throwIfAborted();
    const directory = this.directory(id), bare = path.join(directory, 'repository.git');
    await mkdir(directory, { recursive: true });
    await git(['clone', '--bare', '--no-hardlinks', '--', repository, bare], { signal, timeout: 120000 });
    const targets = {};
    for (const [side, sha, ref] of [['left', left, config.leftRef], ['right', right, config.rightRef]]) {
      signal.throwIfAborted();
      const worktree = path.join(directory, side);
      await git(['--git-dir', bare, 'worktree', 'add', '--detach', worktree, sha], { signal, timeout: 120000 });
      targets[side] = { sha, ref, worktree };
    }
    return { repository, targets };
  }
  async remove(id) { await rm(this.directory(id), { recursive: true, force: true }); }
}
