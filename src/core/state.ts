export interface BaseRenderState {
  url: string;
  runtime: string;
  generatedAt: string;
}

export interface CounterRenderState extends BaseRenderState {
  count: number;
}

export function createBaseRenderState(url: string, runtime: string): BaseRenderState {
  return {
    url,
    runtime,
    generatedAt: new Date().toISOString(),
  };
}

export function createCounterRenderState(url: string, runtime: string, count = 0): CounterRenderState {
  return {
    ...createBaseRenderState(url, runtime),
    count,
  };
}

export function serializeState<T>(state: T): string {
  return JSON.stringify(state).replace(/</g, '\\u003c');
}

export function deserializeState<T>(payload: string, fallback: T): T {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return fallback;
  }
}
