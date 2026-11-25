// Local test server: in-memory Postgres, no production data. Setup code: teste
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../api/app.mjs';

const db = new PGlite();
await db.exec(await readFile('db/schema.sql', 'utf8'));
const app = createApp({ db, setupCode: 'teste', origins: [] });
const root = resolve('docs');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (q, s) => {
  if (q.url.startsWith('/api/')) {
    const ch = [];
    for await (const c of q) ch.push(c);
    const r = await app(new Request('http://localhost' + q.url, { method: q.method, headers: q.headers, body: ch.length ? Buffer.concat(ch) : undefined }));
    s.writeHead(r.status, Object.fromEntries(r.headers));
    return s.end(await r.text());
  }
  const p = q.url.split('?')[0];
  const f = resolve(root, '.' + (p === '/' ? '/index.html' : p));
  if (!f.startsWith(root + sep)) { s.writeHead(403); return s.end(); }
  try {
    const b = await readFile(f);
    s.writeHead(200, { 'content-type': T[extname(f)] || 'text/plain', 'cache-control': 'no-store' });
    s.end(b);
  } catch { s.writeHead(404); s.end(); }
}).listen(4173, '127.0.0.1', () => console.log('http://localhost:4173'));
