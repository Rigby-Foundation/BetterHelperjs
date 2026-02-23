import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import { resolveApiRequest } from './api.js';

export interface ApiServerOptions {
  host?: string;
  port?: number;
}

async function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', reject);
  });
}

function writeResult(response: ServerResponse, status: number, headers: Record<string, string>, body: string): void {
  response.writeHead(status, headers);
  response.end(body);
}

export function createApiServer(options: ApiServerOptions = {}): Server {
  const port = options.port ?? Number(process.env.API_PORT ?? 8787);
  const host = options.host ?? process.env.API_HOST ?? '0.0.0.0';

  const server = createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    const url = request.url ?? '/';

    try {
      const body = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? '' : await readBody(request);
      const result = resolveApiRequest(method, url, body);
      writeResult(response, result.status, result.headers ?? {}, result.body);
    } catch (error) {
      console.error(error);
      writeResult(
        response,
        500,
        {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
        JSON.stringify({
          ok: false,
          error: 'Internal server error',
        })
      );
    }
  });

  server.listen(port, host, () => {
    console.log(`[api] listening on http://${host}:${port}`);
  });

  return server;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1];

if (invokedFile && currentFile === invokedFile) {
  createApiServer();
}
