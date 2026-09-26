// Tiny static server for trying the demo: node scripts/serve.mjs, then open
// http://localhost:8080/demo/index.html (the pickers need http, not file://).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer(async (req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try { res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.statusCode = 404; res.end('not found'); }
}).listen(process.env.PORT || 8080, () => console.log('http://localhost:' + (process.env.PORT || 8080) + '/demo/index.html'));
