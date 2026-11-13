import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { Rooms, type SideName } from '../server/rooms.js';

const root = resolve(process.cwd());
const argOf = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// PaaS（Render/Railway/Fly）会用 PORT 环境变量指定端口
const port = Number(argOf('port', process.env.PORT ?? '8787'));
/** 默认只监听本机；远程对战需要公网可达，用 --host 0.0.0.0 或部署到公网 */
const host = argOf('host', process.env.PORT ? '0.0.0.0' : '127.0.0.1');

const rooms = new Rooms();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function json(res: ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(s);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('body too large');
  }
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function isSide(v: unknown): v is SideName {
  return v === 'wolf' || v === 'sheep';
}

function sse(res: ServerResponse, unsubscribe: () => void): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  const done = (): void => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  };
  res.on('close', done);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  try {
    // ---- 房间 API ----
    if (path === '/api/rooms' && req.method === 'POST') {
      const b = await body(req);
      const side = isSide(b.side) ? b.side : 'wolf';
      return json(res, 200, rooms.create(side));
    }

    const joinMatch = /^\/api\/rooms\/([A-Za-z0-9]+)\/join$/.exec(path);
    if (joinMatch && req.method === 'POST') {
      const r = rooms.join(joinMatch[1]);
      return json(res, r.ok ? 200 : 404, r);
    }

    const stateMatch = /^\/api\/rooms\/([A-Za-z0-9]+)$/.exec(path);
    if (stateMatch && req.method === 'GET') {
      const s = rooms.snapshot(stateMatch[1]);
      return s ? json(res, 200, s) : json(res, 404, { error: '房间不存在' });
    }

    const streamMatch = /^\/api\/rooms\/([A-Za-z0-9]+)\/stream$/.exec(path);
    if (streamMatch && req.method === 'GET') {
      const id = streamMatch[1];
      const snap = rooms.snapshot(id);
      if (!snap) return json(res, 404, { error: '房间不存在' });
      const send = (s: unknown): void => {
        res.write(`event: state\ndata: ${JSON.stringify(s)}\n\n`);
      };
      send(snap);
      const unsub = rooms.subscribe(id, send);
      if (!unsub) return json(res, 404, { error: '房间不存在' });
      return sse(res, unsub);
    }

    const moveMatch = /^\/api\/rooms\/([A-Za-z0-9]+)\/move$/.exec(path);
    if (moveMatch && req.method === 'POST') {
      const b = await body(req);
      const side = b.side;
      const tk = b.token;
      const from = Number(b.from);
      const to = Number(b.to);
      if (!isSide(side) || typeof tk !== 'string' || !Number.isInteger(from) || !Number.isInteger(to)) {
        return json(res, 400, { ok: false, error: '参数不对' });
      }
      const r = rooms.move(moveMatch[1], side, tk, from, to);
      return json(res, r.ok ? 200 : 400, r);
    }

    // ---- 静态文件 ----
    let filePath = path === '/' ? '/index.html' : path;
    const file = normalize(join(root, filePath));
    if (!file.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch {
    if (!res.headersSent) json(res, 404, { error: 'not found' });
    else res.end();
  }
});

server.listen(port, host, () => {
  console.log(`三打十五  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`);
  console.log('  联机对战需要公网可达：--host 0.0.0.0 + 端口映射，或部署到云主机');
});
