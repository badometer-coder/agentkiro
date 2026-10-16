import http from 'http';

const port = process.env.PORT || 10000;

// ciErrorCallback is set by agent-coordinator after bot launches
let ciErrorCallback = null;

export function setCIErrorCallback(fn) {
  ciErrorCallback = fn;
}

const server = http.createServer((req, res) => {
  // Health check - GET any path
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // CI error webhook from GitHub Actions
  if (req.method === 'POST' && req.url === '/ci-error') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { error } = JSON.parse(body);
        console.log(`🚨 CI Error received: ${error}`);
        if (ciErrorCallback) ciErrorCallback(error);
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

export function startHealthServer() {
  server.listen(port, () => {
    console.log(`🏥 Health server on port ${port}`);
    // Self-ping every 10 min to prevent Render sleep
    setInterval(() => {
      http.get(`http://localhost:${port}/`, () => {}).on('error', () => {});
    }, 10 * 60 * 1000);
  });
}
