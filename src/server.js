import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { Sessions } from './core/sessions.js';
import { Store } from './adapters/store.js';
import { GitRepository } from './adapters/git.js';
import { DockerWeb } from './adapters/docker-web.js';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
export async function serve({ port = 4173, dataDirectory = '.gitarena', web, repository } = {}) {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const root = await realpath(dataDirectory), store = new Store(root);
  await store.init();
  const unlock = await store.lock();
  let origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString('hex');
  const adapter = web || new DockerWeb(root, { origin });
  const sessions = new Sessions({ store, repository: repository || new GitRepository(path.join(root, 'work')), web: adapter, newId: randomUUID });
  try { await sessions.recover(); } catch (error) { await unlock(); throw new Error(`Interrupted-session recovery failed. Restore Docker access and restart. ${error.message}`); }
  const json = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'display-capture=(self), camera=(), microphone=()');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src blob:; frame-src http://127.0.0.1:*; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') return json(response, 403, { error: 'Use the local GitArena origin.' });
      const url = new URL(request.url, origin);
      const method = request.method;
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method)) {
          const submitted = Buffer.from(String(request.headers['x-gitarena-token'] || ''));
          if (submitted.length !== token.length || !timingSafeEqual(submitted, Buffer.from(token)) || request.headers['content-type'] !== 'application/json') return json(response, 403, { error: 'Invalid local request token or content type.' });
        }
        let input;
        if (method === 'POST') {
          const chunks = []; let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > 14_000_000) { json(response, 413, { error: 'Feedback is too large (14 MB request limit).' }); return; }
            chunks.push(chunk);
          }
          input = JSON.parse(Buffer.concat(chunks).toString());
        }
        if (method === 'GET' && url.pathname === '/api/bootstrap') return json(response, 200, { token, sessions: sessions.list(), feedback: await store.feedbackList() });
        if (method === 'GET' && url.pathname === '/api/sessions') return json(response, 200, sessions.list());
        if (method === 'POST' && url.pathname === '/api/sessions') return json(response, 202, await sessions.create(input));
        const sessionRoute = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]{36})(\/feedback)?$/);
        if (sessionRoute) {
          const [, id, feedback] = sessionRoute;
          if (method === 'POST' && feedback) return json(response, 201, await sessions.feedback(id, input));
          if (method === 'DELETE' && !feedback) return json(response, 200, await sessions.stop(id));
          if (method === 'GET' && !feedback) return json(response, 200, sessions.get(id));
        }
        if (method === 'GET' && url.pathname === '/api/feedback') return json(response, 200, await store.feedbackList());
        const feedbackRoute = url.pathname.match(/^\/api\/feedback\/([a-f0-9-]{36})$/);
        if (method === 'GET' && feedbackRoute) return json(response, 200, await store.feedback(feedbackRoute[1]));
        return json(response, 404, { error: 'API route not found.' });
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/capture.js': ['capture.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      const file = files[url.pathname];
      if (method !== 'GET' || !file) return json(response, 404, { error: 'Not found.' });
      response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
      response.end(await readFile(path.join(publicRoot, file[0])));
    } catch (error) {
      if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 400, { error: error.message });
      else response.end();
    }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (error) { await unlock(); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`;
  adapter.origin = origin;
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try { await sessions.check(); } catch (error) { console.error('Session health check:', error.message); }
    finally { checking = false; }
  }, 3000);
  timer.unref();
  let closing;
  const close = () => closing ||= (async () => {
    clearInterval(timer);
    // Reject new requests before cancelling startup and removing resources.
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeIdleConnections();
    try { await sessions.close(); await closed; } finally { await unlock(); }
  })();
  return { server, sessions, store, origin, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.GITARENA_PORT || 4173);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('GITARENA_PORT must be between 1024 and 65535.');
    const app = await serve({ port, dataDirectory: process.env.GITARENA_DATA || '.gitarena' });
    console.log(`GitArena: ${app.origin}`);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => { app.close().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); }); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
