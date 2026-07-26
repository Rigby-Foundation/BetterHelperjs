/**
 * The state every SSR render starts from. Apps that need more can extend it
 * and supply their own `createState` to `createSite`.
 */
export interface RenderState {
  url: string;
  runtime: string;
  generatedAt: string;
}

export function createRenderState(url: string, runtime: string): RenderState {
  return {
    url,
    runtime,
    generatedAt: new Date().toISOString(),
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

/* ------------------------------------------------------- deprecated aliases */

/** @deprecated Renamed to {@link RenderState}. Removed in 6.0. */
export type BaseRenderState = RenderState;

/** @deprecated Renamed to {@link createRenderState}. Removed in 6.0. */
export const createBaseRenderState = createRenderState;

/**
 * @deprecated `count` was residue from the counter demo, not framework state.
 * Use {@link RenderState}, and put app state in your own type. Removed in 6.0.
 */
export interface CounterRenderState extends RenderState {
  count: number;
}

/** @deprecated Use {@link createRenderState}. Removed in 6.0. */
export function createCounterRenderState(url: string, runtime: string, count = 0): CounterRenderState {
  return {
    ...createRenderState(url, runtime),
    count,
  };
}
