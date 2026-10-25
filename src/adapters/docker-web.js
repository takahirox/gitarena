import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { command } from './process.js';

export class DockerWeb {
  constructor(root, { run = command, origin = 'http://127.0.0.1:4173' } = {}) {
    this.owner = createHash('sha256').update(root).digest('hex').slice(0, 16);
    this.run = run; this.origin = origin;
  }
  name(id, side) { return `gitarena-${this.owner}-${id}-${side}`; }
  async docker(args) { return this.run('docker', args, { includeStderr: args[0] === 'logs' }); }
  async start(record, side, signal) {
    const { config } = record, target = record.targets[side], name = this.name(record.id, side);
    const args = [
      'create', '--pull=never', '--name', name,
      '--label', `gitarena.owner=${this.owner}`, '--label', `gitarena.session=${record.id}`,
      '--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--user', '1000:1000', '--pids-limit', '256', '--memory', '1g', '--memory-swap', '1g', '--cpus', '1',
      '--stop-timeout', '3', '--log-driver', 'local', '--log-opt', 'max-size=1m', '--log-opt', 'max-file=2',
      '--mount', `type=bind,src=${target.worktree},dst=/source,readonly`,
      '--tmpfs', '/app:rw,nosuid,nodev,size=512m,uid=1000,gid=1000',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,uid=1000,gid=1000',
      '--workdir', '/app', '--env', 'HOME=/tmp', '--env', 'HOST=0.0.0.0', '--env', `PORT=${config.port}`,
      '--publish', `127.0.0.1:${config[`${side}Port`] || ''}:${config.port}`,
      '--entrypoint', '/bin/sh', config.image, '-c',
      'cp -R /source/. /app/ && rm -f /app/.git && /bin/sh -c "$1" && exec /bin/sh -c "$2"',
      'gitarena', config.install, config.start,
    ];
    signal.throwIfAborted();
    try {
      await this.docker(args);
      signal.throwIfAborted();
      await this.docker(['start', name]);
      const mapping = JSON.parse(await this.docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', name]));
      const hostPort = Number(mapping[`${config.port}/tcp`]?.[0]?.HostPort);
      if (!hostPort) throw new Error('Docker did not publish the application port.');
      const url = `http://127.0.0.1:${hostPort}`;
      const deadline = Date.now() + config.timeout * 1000;
      let lastError = 'No HTTP response.';
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (await this.docker(['inspect', '--format', '{{.State.Running}}', name]) !== 'true') throw new Error('Application exited during install/start.');
        try {
          const response = await fetch(`${url}${config.readyPath}`, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) });
          await response.body?.cancel();
          if (response.ok) {
            await this.checkEmbedding(url, signal);
            return { url, hostPort };
          }
          lastError = `Readiness returned HTTP ${response.status}. Use a path that returns 2xx without redirects.`;
        } catch (error) {
          if (error.message.startsWith('Embedding blocked:')) throw error;
          lastError = error.message;
        }
        await delay(300, undefined, { signal });
      }
      throw new Error(`Readiness timed out after ${config.timeout}s: ${lastError} Bind the app to 0.0.0.0:${config.port}; check the commands, path, and timeout.`);
    } catch (error) {
      let logs = '';
      try { logs = await this.docker(['logs', '--tail', '35', name]); } catch { /* Creation may have failed. */ }
      throw new Error(`${side}: ${error.message}${logs ? `\nRecent application output:\n${logs.slice(-4000)}` : ''}\nEnsure Docker is running and the image is pulled; check install/start commands and available host ports.`, { cause: error });
    }
  }
  async checkEmbedding(url, signal) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) throw new Error('Embedding blocked: the app root redirects. Serve the app at / without an external redirect.');
    if (!response.ok) throw new Error(`Embedding blocked: the app root returned HTTP ${response.status}. Serve the preview at /.`);
    if (response.headers.has('x-frame-options')) throw new Error('Embedding blocked: remove X-Frame-Options for this local preview.');
    const policy = response.headers.get('content-security-policy') || '';
    for (const match of policy.matchAll(/(?:^|[;,])\s*frame-ancestors\s+([^;,]+)/gi)) {
      if (!match[1].trim().split(/\s+/).some(value => value === '*' || value === this.origin || value === 'http:')) {
        throw new Error(`Embedding blocked: allow ${this.origin} in CSP frame-ancestors for this local preview.`);
      }
    }
  }
  async stop(id) {
    const ids = await this.docker(['ps', '-aq', '--filter', `label=gitarena.owner=${this.owner}`, '--filter', `label=gitarena.session=${id}`]);
    if (ids) await this.docker(['rm', '-f', ...ids.split(/\s+/)]);
  }
  async healthy(record) {
    const result = await this.docker(['inspect', '--format', '{{.State.Running}}', ...['left', 'right'].map(side => this.name(record.id, side))]);
    return result.split(/\s+/).every(value => value === 'true');
  }
}
