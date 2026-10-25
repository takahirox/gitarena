import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { serve } from '../src/server.js';
import { fixture, fakeWeb, png, settled } from './helpers.js';

test('local HTTP API persists feedback, protects launch requests, and releases lock on shutdown', async t => {
  const { root, config } = await fixture(t), dataDirectory = path.join(root, 'data');
  const app = await serve({ port: 0, dataDirectory, web: fakeWeb() });
  t.after(() => app.close());
  const request = (route, options) => fetch(app.origin + route, options);
  const bootstrap = await (await request('/api/bootstrap')).json();
  const headers = { 'Content-Type': 'application/json', 'X-GitArena-Token': bootstrap.token };
  assert.equal((await request('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })).status, 403);
  assert.equal((await request('/api/sessions', { method: 'POST', headers: { ...headers, Origin: 'http://evil.test' }, body: JSON.stringify(config) })).status, 403);
  const wrongHost = await new Promise(resolve => {
    http.get(app.origin + '/api/bootstrap', { headers: { Host: 'evil.test' } }, response => { response.resume(); resolve(response.statusCode); });
  });
  assert.equal(wrongHost, 403);
  assert.equal((await request('/api/bootstrap', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const response = await request('/api/sessions', { method: 'POST', headers, body: JSON.stringify(config) });
  assert.equal(response.status, 202);
  const s = await settled(app.sessions, await response.json());
  const feedback = await request(`/api/sessions/${s.id}/feedback`, { method: 'POST', headers, body: JSON.stringify({ side: 'right', screenshot: png, width: 1, height: 1, annotations: [], comment: 'Persistent' }) });
  assert.equal(feedback.status, 201);
  const record = await feedback.json();
  assert.equal(record.sourceCommit, s.targets.right.sha);
  await assert.rejects(serve({ port: 0, dataDirectory, web: fakeWeb() }), /already in use/);
  const page = await request('/'); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /Live comparison/);
  await app.close();
  const reopened = await serve({ port: 0, dataDirectory, web: fakeWeb() });
  try {
    assert.equal(reopened.sessions.get(s.id).status, 'stopped');
    assert.equal((await (await fetch(`${reopened.origin}/api/feedback/${record.id}`)).json()).comment, 'Persistent');
  } finally { await reopened.close(); }
});
