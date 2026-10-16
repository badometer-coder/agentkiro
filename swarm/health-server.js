import http from 'http';

// Render requires the app to bind to PORT env variable
const port = process.env.PORT || 10000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://agent-swarm-ceti.onrender.com';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }));
});

server.listen(port, () => {
  console.log(`🏥 Health server running on port ${port}`);

  // Ping self every 10 minutes to prevent Render free tier sleep
  setInterval(() => {
    http.get(`http://localhost:${port}/health`, (res) => {
      console.log(`🏥 Self-ping: ${res.statusCode}`);
    }).on('error', () => {});
  }, 10 * 60 * 1000);
});

process.on('SIGTERM', () => {
  server.close();
});
