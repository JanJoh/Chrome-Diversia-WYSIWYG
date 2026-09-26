// Minimal static server for tests (repo root), plus optional extra routes.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

export async function startServer(root, routes = {}) {
  const server = http.createServer(async (req, res) => {
    const route = Object.keys(routes).find((r) => req.url.startsWith(r));
    if (route) return routes[route](req, res);
    try {
      const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(root)) throw new Error('outside');
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch (e) { res.statusCode = 404; res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}
