// Tiny static server for local development: node serve.mjs [port]
// (ES modules don't load from file://, so open the page over http.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.argv[2]) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  // Work on the URL path (always "/"-separated) before touching the
  // filesystem; `resolve` then collapses any ".." so the root check holds.
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(root, `.${urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
