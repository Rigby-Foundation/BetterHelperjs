export type RuntimeName = 'browser' | 'deno' | 'bun' | 'node' | 'worker' | 'unknown';

export const hasWindow = typeof window !== 'undefined';
export const hasDocument = typeof document !== 'undefined';
export const isBrowser = hasWindow && hasDocument;

export function detectRuntime(): RuntimeName {
  const g = globalThis as Record<string, unknown>;

  if (isBrowser) return 'browser';
  if (typeof g.Deno !== 'undefined') return 'deno';
  if (typeof g.Bun !== 'undefined') return 'bun';
  const processRef = g.process as { versions?: { node?: string } } | undefined;
  if (processRef?.versions?.node) return 'node';
  const isWorkerLike = typeof g.importScripts === 'function' && typeof g.document === 'undefined';
  if (isWorkerLike) return 'worker';
  return 'unknown';
}
