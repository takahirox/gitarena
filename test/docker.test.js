import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DockerWeb } from '../src/adapters/docker-web.js';
import { git } from '../src/adapters/git.js';
import { fixture, manager, settled } from './helpers.js';

test('real Docker: npm executable launches concurrent commits, limits, writable isolation, stop, failed install, blocked embedding, timeout and cancellation', { skip: !process.env.GITARENA_DOCKER_TEST, timeout: 120000 }, async t => {
  const { root, repo, config } = await fixture(t);
  // Install a local CLI offline so npm start must execute a file from /app.
  await mkdir(path.join(repo, 'preview-cli'));
  await writeFile(path.join(repo, 'preview-cli/package.json'), JSON.stringify({ name: 'preview-cli', version: '1.0.0', bin: { preview: 'cli.cjs' } }));
  await writeFile(path.join(repo, 'preview-cli/cli.cjs'), '#!/usr/bin/env node\nrequire(process.cwd() + "/server.cjs");\n');
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'preview-app', version: '1.0.0', scripts: { start: 'preview' }, dependencies: { 'preview-cli': 'file:preview-cli' } }));
  await writeFile(path.join(repo, 'package-lock.json'), JSON.stringify({
    name: 'preview-app', version: '1.0.0', lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'preview-app', version: '1.0.0', dependencies: { 'preview-cli': 'file:preview-cli' } },
      'node_modules/preview-cli': { resolved: 'preview-cli', link: true },
      'preview-cli': { version: '1.0.0', bin: { preview: 'cli.cjs' } },
    },
  }));
  config.install = 'npm ci --offline --no-audit --no-fund'; config.start = 'npm start';
  const source = await readFile(new URL('../examples/counter/server.js', import.meta.url), 'utf8');
  await writeFile(path.join(repo, 'server.cjs'), source);
  await git(['-C', repo, 'add', '.']); await git(['-C', repo, 'commit', '-m', 'First web app']);
  await writeFile(path.join(repo, 'server.cjs'), source.replace("const version = 'First'", "const version = 'Second'"));
  await git(['-C', repo, 'commit', '-am', 'Second web app']);
  const web = new DockerWeb(path.join(root, 'data')), m = await manager(root, web);
  t.after(() => m.close());
  const s = await settled(m, await m.create(config));
  assert.equal(s.status, 'running', s.error);
  const left = await (await fetch(s.targets.left.url)).text(), right = await (await fetch(s.targets.right.url)).text();
  assert.match(left, /First version/); assert.match(right, /Second version/);
  assert.notEqual(s.targets.left.hostPort, s.targets.right.hostPort);
  const inspect = JSON.parse(await web.docker(['inspect', web.name(s.id, 'left')]));
  assert.equal(inspect[0].HostConfig.ReadonlyRootfs, true);
  assert.equal(inspect[0].HostConfig.PidsLimit, 256);
  assert.equal(inspect[0].HostConfig.Memory, 1073741824);
  assert.deepEqual(inspect[0].HostConfig.CapDrop, ['ALL']);
  const isolation = await web.docker(['exec', web.name(s.id, 'left'), 'sh', '-c', 'test ! -S /var/run/docker.sock && test ! -e /app/.git && ! touch /source/should-not-exist 2>/dev/null && echo isolated']);
  assert.equal(isolation, 'isolated');
  await m.stop(s.id);
  assert.equal(await web.docker(['ps', '-aq', '--filter', `label=gitarena.owner=${web.owner}`]), '');
  assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
  await assert.rejects(fetch(s.targets.left.url));
  for (const patch of [
    { install: 'echo install-broken; exit 2' },
    { start: 'node -e \'require("http").createServer((q,s)=>{s.setHeader("X-Frame-Options","DENY");s.end("ok")}).listen(process.env.PORT,"0.0.0.0")\'' },
    { start: 'sleep 30', timeout: 5 },
  ]) {
    const failed = await settled(m, await m.create({ ...config, ...patch }));
    assert.equal(failed.status, 'failed', failed.error);
    assert.equal(await web.docker(['ps', '-aq', '--filter', `label=gitarena.owner=${web.owner}`]), '');
    assert.deepEqual(await readdir(path.join(root, 'data/work')), []);
  }
  const cancelled = await m.create({ ...config, install: 'sleep 30' });
  await new Promise(resolve => setTimeout(resolve, 500));
  await m.stop(cancelled.id); assert.equal(cancelled.status, 'stopped');
  assert.equal(await web.docker(['ps', '-aq', '--filter', `label=gitarena.owner=${web.owner}`]), '');
});

test('real server: SIGTERM cleans running apps; SIGKILL during startup is recovered on restart', { skip: !process.env.GITARENA_DOCKER_TEST, timeout: 60000 }, async t => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const http = await import('node:http');
  const { mkdir, realpath } = await import('node:fs/promises');
  const { serve } = await import('../src/server.js');
  const { root, repo, config } = await fixture(t);
  await writeFile(path.join(repo, 'server.cjs'), await readFile(new URL('../examples/counter/server.js', import.meta.url), 'utf8'));
  await git(['-C', repo, 'add', '.']); await git(['-C', repo, 'commit', '-m', 'Web app']);
  const dataDirectory = path.join(root, 'process-data'); await mkdir(dataDirectory);
  const web = new DockerWeb(await realpath(dataDirectory));
  const waitFor = async predicate => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('Timed out waiting for owned server/container state.');
  };
  const startServer = async () => {
    const reservation = http.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, GITARENA_DATA: dataDirectory, GITARENA_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
    await waitFor(() => { if (child.exitCode !== null) throw new Error(output); return output.includes('GitArena:'); });
    return { child, origin: `http://127.0.0.1:${port}` };
  };
  let child;
  const ids = [];
  try {
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      const started = await startServer(); child = started.child;
      const { token } = await (await fetch(`${started.origin}/api/bootstrap`)).json();
      const s = await (await fetch(`${started.origin}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitArena-Token': token }, body: JSON.stringify({ ...config, leftRef: 'HEAD', rightRef: 'HEAD', ...(signal === 'SIGKILL' ? { install: 'sleep 30' } : {}) }) })).json();
      ids.push(s.id);
      if (signal === 'SIGTERM') await waitFor(async () => (await (await fetch(`${started.origin}/api/sessions/${s.id}`)).json()).status === 'running');
      else await waitFor(async () => await web.docker(['ps', '-aq', '--filter', `label=gitarena.owner=${web.owner}`]));
      const exited = once(child, 'exit'); child.kill(signal); await exited; child = undefined;
      if (signal === 'SIGKILL') {
        const recovery = await serve({ port: 0, dataDirectory });
        try { assert.equal(recovery.sessions.get(s.id).status, 'stopped'); }
        finally { await recovery.close(); }
      }
      assert.equal(await web.docker(['ps', '-aq', '--filter', `label=gitarena.owner=${web.owner}`]), '');
      assert.deepEqual(await readdir(path.join(dataDirectory, 'work')), []);
    }
  } finally {
    if (child) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    for (const id of ids) await web.stop(id);
  }
});
