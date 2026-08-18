/* Static server for public/ so /prototype pages can be previewed without
   the full Next dev server. Mirrors Next's public-dir serving plus
   directory→index.html resolution (Next needs a rewrite for that in prod). */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'public');
const portFlag = process.argv.indexOf('--port');
const requestedPort = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : Number(process.env.PORT ?? 4310);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4310;
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.mp4', 'video/mp4'],
  ['.ttf', 'font/ttf'],
  ['.woff2', 'font/woff2'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error('outside root');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    const extension = extname(file).toLowerCase();
    const range = extension === '.mp4' ? request.headers.range : null;
    const headers = {
      'Content-Type': types.get(extension) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
    };

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { 'Content-Range': `bytes */${body.length}` });
        response.end();
        return;
      }
      const suffixLength = !match[1] && match[2] ? Number(match[2]) : null;
      const start = suffixLength === null
        ? Number(match[1])
        : Math.max(0, body.length - suffixLength);
      const end = suffixLength === null && match[2]
        ? Number(match[2])
        : body.length - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= body.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${body.length}` });
        response.end();
        return;
      }
      const last = Math.min(end, body.length - 1);
      const chunk = body.subarray(start, last + 1);
      response.writeHead(206, {
        ...headers,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${last}/${body.length}`,
        'Content-Length': chunk.length,
      });
      response.end(chunk);
      return;
    }

    if (extension === '.mp4') headers['Accept-Ranges'] = 'bytes';
    response.writeHead(200, headers);
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`prototype preview: http://127.0.0.1:${port}`);
});
