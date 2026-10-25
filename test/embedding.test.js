import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DockerWeb } from '../src/adapters/docker-web.js';

test('embedding checks reject incompatible headers and every restrictive CSP policy', async t => {
  let headers = {}, status = 200;
  const server = http.createServer((request, response) => { response.writeHead(status, headers); response.end('preview'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`, adapter = new DockerWeb('/fixture');
  const signal = new AbortController().signal;
  for (const policy of ["frame-ancestors 'none'", "frame-ancestors 'self'", "frame-ancestors *; default-src 'self', frame-ancestors 'none'"]) {
    headers = { 'Content-Security-Policy': policy };
    await assert.rejects(adapter.checkEmbedding(url, signal), /allow http/);
  }
  headers = { 'X-Frame-Options': 'SAMEORIGIN' };
  await assert.rejects(adapter.checkEmbedding(url, signal), /X-Frame-Options/);
  for (const policy of ['frame-ancestors *', `frame-ancestors ${adapter.origin}`]) {
    headers = { 'Content-Security-Policy': policy }; await adapter.checkEmbedding(url, signal);
  }
  headers = {};
  for (status of [302, 500]) await assert.rejects(adapter.checkEmbedding(url, signal), /Embedding blocked/);
});
