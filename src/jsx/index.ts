import {
  createHostDom,
  hydrateHostChildren,
  isVoidTag,
  patchHostChildren,
  serializeHostNodes,
  type HostElement,
  type HostKey,
  type HostNode,
  type HydrateReport,
} from './host.js';
import { Fragment, type Primitive, type VNode, type VNodeChild, type VNodeType } from './jsx-runtime.js';

interface EffectEntry {
  deps?: readonly unknown[];
  cleanup?: () => void;
  effect: EffectCallback;
}

interface HookStore {
  values: unknown[];
  effects: Array<EffectEntry | undefined>;
}

interface HookRuntime {
  staticRender: boolean;
  stores: Map<string, HookStore>;
  contextValues: Map<Context<unknown>, unknown[]>;
  activePaths: Set<string>;
  pendingEffects: Array<() => void>;
  scheduleRender: () => void;
}

interface MountedRuntime extends HookRuntime {
  root: Element;
  currentNode: VNodeChild;
  hostTree: HostNode[];
  rendering: boolean;
  rerenderQueued: boolean;
  pendingHydrate: boolean;
}

interface StateSlot<T> {
  value: T;
  set: (next: SetStateAction<T>) => void;
}

interface MemoSlot<T> {
  value: T;
  deps?: readonly unknown[];
}

interface ReducerSlot<State, Action> {
  state: State;
  reducer: Reducer<State, Action>;
  dispatch: (action: Action) => void;
}

const runtimeByRoot = new WeakMap<Element, MountedRuntime>();

let activeHookRuntime: HookRuntime | null = null;
let activeHookStore: HookStore | null = null;
let activeHookIndex = 0;

export type SetStateAction<T> = T | ((prev: T) => T);
export type EffectCleanup = void | (() => void);
export type EffectCallback = () => EffectCleanup;
export type Reducer<State, Action> = (state: State, action: Action) => State;
export interface RefObject<T> {
  current: T;
}

export interface ContextProviderProps<T> {
  value: T;
  children?: VNodeChild | VNodeChild[];
}

type ContextProviderComponent<T> = ((props: Record<string, unknown> & { children?: VNodeChild | VNodeChild[] }) => VNodeChild) & {
  __karuiContext: Context<T>;
};

export interface Context<T> {
  Provider: ContextProviderComponent<T>;
  _defaultValue: T;
}

function isVNode(value: VNodeChild): value is VNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value && 'props' in value;
}

function isContextProviderType(type: VNodeType): type is ContextProviderComponent<unknown> {
  return typeof type === 'function' && '__karuiContext' in type;
}

function withContextValue<T, TResult>(runtime: HookRuntime, context: Context<T>, value: T, render: () => TResult): TResult {
  const stack = runtime.contextValues.get(context as Context<unknown>) ?? [];
  runtime.contextValues.set(context as Context<unknown>, stack);
  stack.push(value);

  try {
    return render();
  } finally {
    stack.pop();
    if (stack.length === 0) {
      runtime.contextValues.delete(context as Context<unknown>);
    }
  }
}

function createHookStore(): HookStore {
  return {
    values: [],
    effects: [],
  };
}

function createStaticRuntime(): HookRuntime {
  return {
    staticRender: true,
    stores: new Map<string, HookStore>(),
    contextValues: new Map<Context<unknown>, unknown[]>(),
    activePaths: new Set<string>(),
    pendingEffects: [],
    scheduleRender: () => {},
  };
}

function prepareRuntime(runtime: HookRuntime): void {
  runtime.activePaths.clear();
  runtime.pendingEffects.length = 0;
}

function flushEffects(runtime: HookRuntime): void {
  if (runtime.staticRender) return;

  while (runtime.pendingEffects.length > 0) {
    const queue = runtime.pendingEffects.splice(0, runtime.pendingEffects.length);
    for (const run of queue) {
      run();
    }
  }
}

function cleanupStore(store: HookStore): void {
  for (const entry of store.effects) {
    if (entry && typeof entry.cleanup === 'function') {
      entry.cleanup();
    }
  }
}

function cleanupUnmounted(runtime: HookRuntime): void {
  for (const [path, store] of runtime.stores.entries()) {
    if (runtime.activePaths.has(path)) continue;
    cleanupStore(store);
    runtime.stores.delete(path);
  }
}

function areDepsEqual(prevDeps: readonly unknown[], nextDeps: readonly unknown[]): boolean {
  if (prevDeps.length !== nextDeps.length) return false;

  for (let index = 0; index < prevDeps.length; index += 1) {
    if (!Object.is(prevDeps[index], nextDeps[index])) {
      return false;
    }
  }

  return true;
}

function withHooks<T>(runtime: HookRuntime, path: string, render: () => T): T {
  runtime.activePaths.add(path);

  const store = runtime.stores.get(path) ?? createHookStore();
  runtime.stores.set(path, store);

  const prevRuntime = activeHookRuntime;
  const prevStore = activeHookStore;
  const prevIndex = activeHookIndex;

  activeHookRuntime = runtime;
  activeHookStore = store;
  activeHookIndex = 0;

  try {
    return render();
  } finally {
    activeHookRuntime = prevRuntime;
    activeHookStore = prevStore;
    activeHookIndex = prevIndex;
  }
}

function nextHookSlot(name: string): { runtime: HookRuntime; store: HookStore; index: number } {
  if (!activeHookRuntime || !activeHookStore) {
    throw new Error(`${name}() must be called inside a function component`);
  }

  const index = activeHookIndex;
  activeHookIndex += 1;

  return {
    runtime: activeHookRuntime,
    store: activeHookStore,
    index,
  };
}

function queueEffect(runtime: HookRuntime, store: HookStore, index: number): void {
  if (runtime.staticRender) return;

  runtime.pendingEffects.push(() => {
    const current = store.effects[index];
    if (!current) return;

    if (typeof current.cleanup === 'function') {
      current.cleanup();
    }

    const cleanup = current.effect();
    current.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  });
}

/* ---------------------------------------------------------------- normalize */

/**
 * Flatten a VNode tree into host nodes, running components (and their hooks)
 * on the way down. One walk feeds SSR, client render, and hydration alike,
 * which is what lets hydration trust that both sides produced the same shape.
 *
 * Hook identity comes from the path built here. A keyed child contributes
 * `$<key>` instead of its index, so hook state follows the item rather than
 * the slot it happens to occupy.
 */
function normalizeInto(out: HostNode[], node: VNodeChild, runtime: HookRuntime, path: string, svg: boolean): void {
  if (node == null || typeof node === 'boolean') {
    // A stable placeholder keeps sibling positions steady across renders.
    out.push({ kind: 'text', key: null, value: '' });
    return;
  }

  if (typeof node === 'string' || typeof node === 'number') {
    out.push({ kind: 'text', key: null, value: String(node) });
    return;
  }

  if (Array.isArray(node)) {
    normalizeChildren(out, node, runtime, path, svg);
    return;
  }

  if (!isVNode(node)) {
    out.push({ kind: 'text', key: null, value: '' });
    return;
  }

  if (node.type === Fragment) {
    normalizeChildren(out, (node.props as { children?: VNodeChild | VNodeChild[] }).children, runtime, `${path}.f`, svg);
    return;
  }

  if (isContextProviderType(node.type)) {
    const props = node.props as unknown as ContextProviderProps<unknown>;
    withContextValue(runtime, node.type.__karuiContext, props.value, () => {
      normalizeChildren(out, props.children, runtime, `${path}.p`, svg);
    });
    return;
  }

  if (typeof node.type === 'function') {
    const render = node.type as (props: Record<string, unknown>) => VNodeChild;
    withHooks(runtime, path, () => {
      normalizeInto(out, render(node.props as Record<string, unknown>), runtime, `${path}.0`, svg);
    });
    return;
  }

  const tag = node.type;
  const props = node.props as Record<string, unknown>;
  const elementSvg = svg || tag === 'svg';

  const element: HostElement = {
    kind: 'element',
    tag,
    svg: elementSvg,
    key: node.key,
    props,
    children: [],
  };

  if (!isVoidTag(tag) && props['dangerouslySetInnerHTML'] === undefined) {
    normalizeChildren(
      element.children,
      (props as { children?: VNodeChild | VNodeChild[] }).children,
      runtime,
      path,
      // <foreignObject> switches back to the HTML namespace for its subtree.
      elementSvg && tag !== 'foreignObject'
    );
  }

  out.push(element);
}

function normalizeChildren(
  out: HostNode[],
  children: VNodeChild | VNodeChild[] | undefined,
  runtime: HookRuntime,
  path: string,
  svg: boolean
): void {
  if (children == null) return;

  const list = Array.isArray(children) ? children : [children];
  const usedSegments = new Set<string>();

  for (let index = 0; index < list.length; index += 1) {
    const child = list[index];
    const key: HostKey = isVNode(child) ? child.key : null;

    let segment = key == null ? String(index) : `$${key}`;
    if (key != null && usedSegments.has(segment)) {
      // Duplicate keys must not silently share one hook store.
      segment = `${segment}#${index}`;
    }
    usedSegments.add(segment);

    const before = out.length;
    normalizeInto(out, child, runtime, `${path}.${segment}`, svg);

    // A key written on a component belongs to the host node that component
    // produced, so reconciliation can match it across reorders.
    if (key != null && out.length > before && out[before].key == null) {
      out[before].key = key;
    }
  }
}

function normalizeRoot(node: VNodeChild, runtime: HookRuntime): HostNode[] {
  const out: HostNode[] = [];
  normalizeInto(out, node, runtime, '0', false);
  return out;
}

/* -------------------------------------------------------------------- mount */

function commitMountedRuntime(runtime: MountedRuntime): void {
  if (runtime.rendering) {
    runtime.rerenderQueued = true;
    return;
  }

  runtime.rendering = true;

  try {
    do {
      runtime.rerenderQueued = false;
      prepareRuntime(runtime);

      const owner = runtime.root.ownerDocument ?? document;
      const nextTree = normalizeRoot(runtime.currentNode, runtime);

      if (runtime.pendingHydrate) {
        runtime.pendingHydrate = false;
        hydrateHostChildren(runtime.root, nextTree, owner);
      } else {
        patchHostChildren(runtime.root, runtime.hostTree, nextTree, owner);
      }

      runtime.hostTree = nextTree;

      cleanupUnmounted(runtime);
      flushEffects(runtime);
    } while (runtime.rerenderQueued);
  } finally {
    runtime.rendering = false;
  }
}

function createMountedRuntime(root: Element, node: VNodeChild): MountedRuntime {
  const runtime: MountedRuntime = {
    staticRender: false,
    stores: new Map<string, HookStore>(),
    contextValues: new Map<Context<unknown>, unknown[]>(),
    activePaths: new Set<string>(),
    pendingEffects: [],
    root,
    currentNode: node,
    hostTree: [],
    rendering: false,
    rerenderQueued: false,
    pendingHydrate: false,
    scheduleRender: () => {
      runtime.rerenderQueued = true;
      commitMountedRuntime(runtime);
    },
  };

  return runtime;
}

export function renderToString(node: VNodeChild): string {
  const runtime = createStaticRuntime();
  prepareRuntime(runtime);
  const tree = normalizeRoot(node, runtime);
  cleanupUnmounted(runtime);
  return serializeHostNodes(tree);
}

export function renderToDom(node: VNodeChild, doc: Document = document): Node {
  const runtime = createStaticRuntime();
  prepareRuntime(runtime);
  const tree = normalizeRoot(node, runtime);
  cleanupUnmounted(runtime);

  if (tree.length === 1) {
    return createHostDom(tree[0], doc);
  }

  const fragment = doc.createDocumentFragment();
  for (const child of tree) {
    fragment.appendChild(createHostDom(child, doc));
  }

  return fragment;
}

/**
 * Render `node` into `root`, reusing the DOM already there.
 *
 * Updates diff against the previous render, so element identity, focus,
 * text selection, scroll offsets and uncontrolled input values all survive.
 */
export function mount(root: Element, node: VNodeChild): void {
  const runtime = runtimeByRoot.get(root) ?? createMountedRuntime(root, node);
  runtime.currentNode = node;
  runtimeByRoot.set(root, runtime);
  runtime.scheduleRender();
}

/**
 * Adopt server-rendered markup inside `root` rather than rebuilding it: attach
 * event handlers and hook state to the DOM that is already on the page. Later
 * updates behave exactly like `mount`.
 */
export function hydrate(root: Element, node: VNodeChild): void {
  const existing = runtimeByRoot.get(root);

  if (existing) {
    mount(root, node);
    return;
  }

  const runtime = createMountedRuntime(root, node);
  runtime.pendingHydrate = true;
  runtimeByRoot.set(root, runtime);
  runtime.scheduleRender();
}

/** Tear down a mounted root: run effect cleanups, release refs, empty the DOM. */
export function unmount(root: Element): void {
  const runtime = runtimeByRoot.get(root);
  if (!runtime) return;

  const owner = root.ownerDocument ?? document;
  patchHostChildren(root, runtime.hostTree, [], owner);

  for (const store of runtime.stores.values()) {
    cleanupStore(store);
  }

  runtime.stores.clear();
  runtime.hostTree = [];
  runtimeByRoot.delete(root);
}

/* -------------------------------------------------------------------- hooks */

export function useState<T>(initialState: T | (() => T)): [T, (next: SetStateAction<T>) => void] {
  const { runtime, store, index } = nextHookSlot('useState');

  let slot = store.values[index] as StateSlot<T> | undefined;

  if (!slot) {
    const value = typeof initialState === 'function' ? (initialState as () => T)() : initialState;

    slot = {
      value,
      set: (next: SetStateAction<T>) => {
        const nextValue = typeof next === 'function'
          ? (next as (prev: T) => T)(slot!.value)
          : next;

        if (Object.is(slot!.value, nextValue)) {
          return;
        }

        slot!.value = nextValue;

        if (!runtime.staticRender) {
          runtime.scheduleRender();
        }
      },
    };

    store.values[index] = slot;
  }

  return [slot.value, slot.set];
}

export function useRef<T>(initialValue: T): RefObject<T> {
  const { store, index } = nextHookSlot('useRef');

  let ref = store.values[index] as RefObject<T> | undefined;
  if (!ref) {
    ref = { current: initialValue };
    store.values[index] = ref;
  }

  return ref;
}

export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
  const { store, index } = nextHookSlot('useMemo');
  const previous = store.values[index] as MemoSlot<T> | undefined;

  if (!previous || !previous.deps || !areDepsEqual(previous.deps, deps)) {
    const nextValue = factory();
    const memo: MemoSlot<T> = {
      value: nextValue,
      deps: [...deps],
    };
    store.values[index] = memo;
    return nextValue;
  }

  return previous.value;
}

export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T {
  return useMemo(() => callback, deps);
}

export function useReducer<State, Action>(
  reducer: Reducer<State, Action>,
  initialState: State
): [State, (action: Action) => void];
export function useReducer<State, Action, InitialArg>(
  reducer: Reducer<State, Action>,
  initialArg: InitialArg,
  init: (arg: InitialArg) => State
): [State, (action: Action) => void];
export function useReducer<State, Action, InitialArg>(
  reducer: Reducer<State, Action>,
  initialArg: State | InitialArg,
  init?: (arg: InitialArg) => State
): [State, (action: Action) => void] {
  const { runtime, store, index } = nextHookSlot('useReducer');
  let slot = store.values[index] as ReducerSlot<State, Action> | undefined;

  if (!slot) {
    const initialState = init
      ? init(initialArg as InitialArg)
      : (initialArg as State);

    slot = {
      state: initialState,
      reducer,
      dispatch: (action: Action) => {
        const nextState = slot!.reducer(slot!.state, action);
        if (Object.is(nextState, slot!.state)) {
          return;
        }

        slot!.state = nextState;

        if (!runtime.staticRender) {
          runtime.scheduleRender();
        }
      },
    };

    store.values[index] = slot;
  } else {
    slot.reducer = reducer;
  }

  return [slot.state, slot.dispatch];
}

export function createContext<T>(defaultValue: T): Context<T> {
  const context = {
    _defaultValue: defaultValue,
  } as Context<T>;

  const Provider = ((props: Record<string, unknown> & { children?: VNodeChild | VNodeChild[] }) =>
    props.children ?? null) as ContextProviderComponent<T>;
  Provider.__karuiContext = context;
  context.Provider = Provider;

  return context;
}

export function useContext<T>(context: Context<T>): T {
  const { runtime } = nextHookSlot('useContext');
  const stack = runtime.contextValues.get(context as Context<unknown>);

  if (!stack || stack.length === 0) {
    return context._defaultValue;
  }

  return stack[stack.length - 1] as T;
}

export function useEffect(effect: EffectCallback, deps?: readonly unknown[]): void {
  const { runtime, store, index } = nextHookSlot('useEffect');
  const previous = store.effects[index];

  const changed = !previous
    || deps === undefined
    || previous.deps === undefined
    || !areDepsEqual(previous.deps, deps);

  if (!previous) {
    store.effects[index] = { effect, deps };
    queueEffect(runtime, store, index);
    return;
  }

  previous.effect = effect;

  if (deps !== undefined) {
    previous.deps = [...deps];
  } else {
    previous.deps = undefined;
  }

  if (changed) {
    queueEffect(runtime, store, index);
  }
}

export type { HostElement, HostNode, HydrateReport, Primitive, VNode, VNodeChild, VNodeType };
export { Fragment };
