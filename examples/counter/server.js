const http = require('node:http');
const version = 'First';
http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><html><head><title>${version} counter</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:20px system-ui;padding:40px;background:${version === 'First' ? '#edf5f0' : '#eaf0fb'}"><h1>${version} version</h1><p>A tiny app to compare.</p><button style="font:inherit;padding:14px" onclick="this.textContent=Number(this.textContent)+1">0</button></body></html>`);
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
