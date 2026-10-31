import http from 'http';
import https from 'https';

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
        let error;
        // Try parsing as JSON first
        try {
          const parsed = JSON.parse(body);
          // Accept various field names: error, errors, message, output
          error = parsed.error || parsed.errors || parsed.message || parsed.output || null;
          // If it's an array, join it
          if (Array.isArray(error)) error = error.join('\n');
        } catch (e) {
          // Not JSON — use raw body as the error message
          error = body.trim() || null;
        }

        // Guard: skip if no error message
        if (!error || typeof error !== 'string' || error.length === 0) {
          console.log(`⚠️ CI webhook received but no error message in payload`);
          res.writeHead(200);
          res.end('ok - no error content');
          return;
        }

        console.log(`🚨 CI Error received: ${error.substring(0, 100)}...`);
        if (ciErrorCallback) ciErrorCallback(error);
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.error(`❌ CI webhook error: ${e.message}`);
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
    // Ping public URL every 10 min to prevent Render free tier sleep
    const publicUrl = process.env.RENDER_EXTERNAL_URL || `https://agent-swarm-ceti.onrender.com`;
    setInterval(() => {
      // External ping — keeps Render free tier awake
      https.get(`${publicUrl}/`, () => {}).on('error', () => {});
      // Also local ping
      http.get(`http://localhost:${port}/`, () => {}).on('error', () => {});
    }, 10 * 60 * 1000);
  });
}
