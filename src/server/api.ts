import { createHelper } from '../index.js';
import { detectRuntime } from '../core/runtime.js';

export interface ApiResult {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function resolveApiRequest(method: string, requestUrl: string, body = ''): ApiResult {
  const normalizedMethod = method.toUpperCase();
  const url = new URL(requestUrl, 'http://localhost');

  if (normalizedMethod === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    return {
      status: 204,
      headers: defaultHeaders,
      body: '',
    };
  }

  if (normalizedMethod === 'GET' && url.pathname === '/api/health') {
    return {
      status: 200,
      headers: defaultHeaders,
      body: JSON.stringify({
        ok: true,
        service: 'better-helperjs-api',
        runtime: detectRuntime(),
        now: new Date().toISOString(),
      }),
    };
  }

  if (normalizedMethod === 'GET' && url.pathname === '/api/helper') {
    const helper = createHelper({
      bindErrors: false,
      enableBrowserModules: false,
    });

    return {
      status: 200,
      headers: defaultHeaders,
      body: JSON.stringify({
        version: helper.ver,
        runtime: helper.runtime,
      }),
    };
  }

  if (normalizedMethod === 'POST' && url.pathname === '/api/echo') {
    let payload: unknown = body;

    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        payload = body;
      }
    }

    return {
      status: 200,
      headers: defaultHeaders,
      body: JSON.stringify({
        ok: true,
        payload,
      }),
    };
  }

  return {
    status: 404,
    headers: defaultHeaders,
    body: JSON.stringify({
      ok: false,
      error: `Not found: ${url.pathname}`,
    }),
  };
}
