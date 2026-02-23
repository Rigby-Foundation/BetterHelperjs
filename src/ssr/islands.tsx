import { serializeState } from '../core/state.js';
import { mount } from '../jsx/index.js';
import { jsx, type VNodeChild } from '../jsx/jsx-runtime.js';

export interface IslandPayloadEntry {
  id: number;
  key: string;
  props: Record<string, unknown>;
}

interface IslandCollector {
  entries: IslandPayloadEntry[];
  nextId: number;
}

export interface DefineIslandOptions {
  key?: string;
  wrapperTag?: string;
  wrapperProps?: Record<string, unknown>;
}

export interface HydrateIslandsOptions {
  stateKey?: string;
  root?: ParentNode;
  payload?: IslandPayloadEntry[];
  onError?: (error: unknown, entry: IslandPayloadEntry) => void;
}

type IslandComponent<Props extends Record<string, unknown>> = (props: Props) => VNodeChild;

const DEFAULT_ISLANDS_KEY = '__BH_ISLANDS__';
const islandRegistry = new Map<string, IslandComponent<Record<string, unknown>>>();

let islandKeyCounter = 0;
let activeCollector: IslandCollector | null = null;

function resolveIslandKey(component: Function, key?: string): string {
  if (key && key.trim()) return key.trim();
  if (component.name) return component.name;

  islandKeyCounter += 1;
  return `island-${islandKeyCounter}`;
}

export function collectIslands<T>(render: () => T): { result: T; islands: IslandPayloadEntry[] } {
  const collector: IslandCollector = {
    entries: [],
    nextId: 0,
  };

  const previous = activeCollector;
  activeCollector = collector;

  try {
    const result = render();
    return {
      result,
      islands: collector.entries,
    };
  } finally {
    activeCollector = previous;
  }
}

export function serializeIslands(payload: IslandPayloadEntry[]): string {
  return serializeState(payload);
}

export function defineIsland<Props extends Record<string, unknown>>(
  component: IslandComponent<Props>,
  options: DefineIslandOptions = {}
): IslandComponent<Props> {
  const normalizedComponent = component as unknown as IslandComponent<Record<string, unknown>>;
  const key = resolveIslandKey(component as unknown as Function, options.key);
  const existing = islandRegistry.get(key);

  if (existing && existing !== component) {
    throw new Error(`Island key "${key}" is already registered`);
  }

  islandRegistry.set(key, normalizedComponent);

  return (props: Props): VNodeChild => {
    if (!activeCollector) {
      return jsx(normalizedComponent, props as Record<string, unknown>);
    }

    const id = activeCollector.nextId;
    activeCollector.nextId += 1;
    activeCollector.entries.push({
      id,
      key,
      props,
    });

    const tag = options.wrapperTag ?? 'div';
    const wrapperProps: Record<string, unknown> = {
      ...(options.wrapperProps ?? {}),
      'data-bh-island': String(id),
      'data-bh-island-key': key,
      children: jsx(normalizedComponent, props as Record<string, unknown>),
    };

    return jsx(tag, wrapperProps);
  };
}

export function hydrateIslands(options: HydrateIslandsOptions = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const root = options.root ?? document;
  const stateKey = options.stateKey ?? DEFAULT_ISLANDS_KEY;
  const payloadFromWindow = (window as unknown as Record<string, unknown>)[stateKey];
  const payload = options.payload ?? (Array.isArray(payloadFromWindow) ? payloadFromWindow as IslandPayloadEntry[] : []);

  for (const entry of payload) {
    const target = root.querySelector?.(`[data-bh-island="${String(entry.id)}"]`);
    if (!(target instanceof Element)) {
      continue;
    }

    const component = islandRegistry.get(entry.key);
    if (!component) {
      options.onError?.(new Error(`Island "${entry.key}" is not registered`), entry);
      continue;
    }

    try {
      mount(target, jsx(component, entry.props));
    } catch (error) {
      options.onError?.(error, entry);
    }
  }

  return () => {};
}
