import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from '../src/server.js';
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'gitarena-ui-'));
const apps = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(`<html><body><h1>${request.url.includes('left') ? 'First' : 'Second'} version</h1><button onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>`);
});
await new Promise(resolve => apps.listen(0, '127.0.0.1', resolve));
const app = await serve({ port: 4187, dataDirectory,
  repository: {
    async prepare(id, config, signal) {
      await delay(100, undefined, { signal });
      if (config.leftRef === 'missing') throw new Error('Invalid commit: missing. Choose a valid ref.');
      return { repository: config.repository, targets: { left: { sha: 'a'.repeat(40), ref: config.leftRef }, right: { sha: 'b'.repeat(40), ref: config.rightRef } } };
    }, async remove() {},
  },
  web: {
    async start(record, side, signal) { await delay(100, undefined, { signal }); return { url: `http://127.0.0.1:${apps.address().port}/${side}` }; },
    async stop() {}, async healthy() { return true; },
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await app.close(); apps.close(); await rm(dataDirectory, { recursive: true, force: true }); process.exit(0);
});
