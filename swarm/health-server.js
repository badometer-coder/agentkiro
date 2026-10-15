// Simple health check server to keep Render.com awake
import http from 'http';

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(port, () => {
  console.log(`🏥 Health check server running on port ${port}`);
});

// Keep process alive
process.on('SIGTERM', () => {
  console.log('Health server shutting down');
  server.close();
});
