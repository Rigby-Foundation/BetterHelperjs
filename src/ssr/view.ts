import { serializeState as serializeFrameworkState, type CounterRenderState } from '../core/state.js';

export interface SsrAppState extends CounterRenderState {}

export function serializeState(state: SsrAppState): string {
  return serializeFrameworkState(state);
}
