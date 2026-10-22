const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const MOBILE_DIR = path.resolve(__dirname, '../../apps/gridcraft-mobile');
const WASM_DIR = path.resolve(__dirname, 'gridcraft-web-0.10.0');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = urlObj.pathname;

  let baseDir = MOBILE_DIR;
  let fileSubPath = reqPath;

  if (reqPath.startsWith('/excel')) {
    baseDir = WASM_DIR;
    fileSubPath = reqPath.replace(/^\/excel/, '') || '/index.html';
  } else if (reqPath.endsWith('.wasm') || reqPath.includes('gridcraft-web')) {
    baseDir = WASM_DIR;
  }

  if (fileSubPath === '/' || fileSubPath === '') {
    fileSubPath = '/index.html';
  }

  let filePath = path.join(baseDir, fileSubPath);

  // Fallback to MOBILE_DIR if not found in WASM_DIR and vice versa
  if (!fs.existsSync(filePath)) {
    const altPath = path.join(WASM_DIR, fileSubPath);
    if (fs.existsSync(altPath)) {
      filePath = altPath;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Không tìm thấy trang (Not Found)');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GridCraft Mobile & WASM Server ready at http://0.0.0.0:${PORT}`);
});
