import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const path = resolve(root, '.' + (pathname === '/' ? '/examples/index.html' : pathname));
  if (!path.startsWith(root + sep) || !['.html', '.js', '.css'].includes(extname(path))) {
    response.writeHead(404).end();
    return;
  }
  void readFile(path)
    .then((content) => {
      response
        .writeHead(200, {
          'Content-Type': {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
          }[extname(path)],
          'Cache-Control': 'no-store',
        })
        .end(content);
    })
    .catch(() => response.writeHead(404).end());
});
server.listen(4187, '127.0.0.1');
