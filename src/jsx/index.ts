import { Fragment, type Primitive, type VNode, type VNodeChild, type VNodeType } from './jsx-runtime.js';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

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
  rendering: boolean;
  rerenderQueued: boolean;
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
  __bhContext: Context<T>;
};

export interface Context<T> {
  Provider: ContextProviderComponent<T>;
  _defaultValue: T;
}

function isVNode(value: VNodeChild): value is VNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value && 'props' in value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function flatten(children: VNodeChild | VNodeChild[] | undefined): VNodeChild[] {
  if (children == null) return [];

  const result: VNodeChild[] = [];
  const stack = Array.isArray(children) ? [...children] : [children];

  while (stack.length > 0) {
    const current = stack.shift() as VNodeChild;

    if (Array.isArray(current)) {
      stack.unshift(...current);
      continue;
    }

    result.push(current);
  }

  return result;
}

function toStyleString(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return String(value);
  }

  const parts: string[] = [];
  const styleRecord = value as Record<string, unknown>;

  for (const key of Object.keys(styleRecord)) {
    const styleValue = styleRecord[key];
    if (styleValue == null || styleValue === false) continue;

    const cssKey = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
    parts.push(`${cssKey}:${String(styleValue)}`);
  }

  return parts.join(';');
}

function renderPropsToString(props: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const key of Object.keys(props)) {
    if (key === 'children' || key === 'key' || key === 'ref') continue;

    const value = props[key];
    if (value == null || value === false || typeof value === 'function') continue;
    if (key.startsWith('on')) continue;

    const attr = key === 'className' ? 'class' : key;

    if (value === true) {
      parts.push(attr);
      continue;
    }

    const attrValue = attr === 'style' ? toStyleString(value) : String(value);
    parts.push(`${attr}="${escapeHtml(attrValue)}"`);
  }

  return parts.length ? ` ${parts.join(' ')}` : '';
}

function resolveComponent(type: VNodeType, props: Record<string, unknown>): VNodeChild {
  if (type === Fragment) {
    return props.children as VNodeChild;
  }

  return (type as (p: Record<string, unknown>) => VNodeChild)(props);
}

function isContextProviderType(type: VNodeType): type is ContextProviderComponent<unknown> {
  return typeof type === 'function' && '__bhContext' in type;
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

function renderToStringInternal(node: VNodeChild, runtime: HookRuntime, path: string): string {
  if (node == null || typeof node === 'boolean') return '';

  if (typeof node === 'string' || typeof node === 'number') {
    return escapeHtml(String(node));
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => renderToStringInternal(child, runtime, `${path}.${index}`)).join('');
  }

  if (!isVNode(node)) {
    return '';
  }

  if (node.type === Fragment) {
    return renderToStringInternal(resolveComponent(node.type, node.props as Record<string, unknown>), runtime, `${path}.f`);
  }

  if (isContextProviderType(node.type)) {
    const props = node.props as unknown as ContextProviderProps<unknown>;
    return withContextValue(runtime, node.type.__bhContext, props.value, () =>
      renderToStringInternal(props.children ?? null, runtime, `${path}.p`)
    );
  }

  if (typeof node.type === 'function') {
    return withHooks(runtime, path, () =>
      renderToStringInternal(resolveComponent(node.type, node.props as Record<string, unknown>), runtime, `${path}.0`)
    );
  }

  const tag = node.type;
  const attrs = renderPropsToString(node.props as Record<string, unknown>);
  const children = flatten((node.props as { children?: VNodeChild | VNodeChild[] }).children);

  if (VOID_TAGS.has(tag)) {
    return `<${tag}${attrs}>`;
  }

  const content = children.map((child, index) => renderToStringInternal(child, runtime, `${path}.${index}`)).join('');
  return `<${tag}${attrs}>${content}</${tag}>`;
}

function setDomProp(element: HTMLElement, key: string, value: unknown): void {
  if (key === 'children' || key === 'key' || key === 'ref') return;

  if (key.startsWith('on') && typeof value === 'function') {
    const eventName = key.slice(2).toLowerCase();
    element.addEventListener(eventName, value as EventListener);
    return;
  }

  if (value == null || value === false) return;

  const attr = key === 'className' ? 'class' : key;

  if (attr === 'style' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const styleRecord = value as Record<string, unknown>;

    for (const styleKey of Object.keys(styleRecord)) {
      const styleValue = styleRecord[styleKey];
      if (styleValue == null) continue;
      (element.style as CSSStyleDeclaration & Record<string, string>)[styleKey] = String(styleValue);
    }

    return;
  }

  if (value === true) {
    element.setAttribute(attr, '');
    return;
  }

  element.setAttribute(attr, String(value));
}

function renderToDomInternal(node: VNodeChild, doc: Document, runtime: HookRuntime, path: string): Node {
  if (node == null || typeof node === 'boolean') {
    return doc.createTextNode('');
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return doc.createTextNode(String(node));
  }

  if (Array.isArray(node)) {
    const fragment = doc.createDocumentFragment();
    for (let index = 0; index < node.length; index += 1) {
      fragment.appendChild(renderToDomInternal(node[index], doc, runtime, `${path}.${index}`));
    }
    return fragment;
  }

  if (!isVNode(node)) {
    return doc.createTextNode('');
  }

  if (node.type === Fragment) {
    return renderToDomInternal(resolveComponent(node.type, node.props as Record<string, unknown>), doc, runtime, `${path}.f`);
  }

  if (isContextProviderType(node.type)) {
    const props = node.props as unknown as ContextProviderProps<unknown>;
    return withContextValue(runtime, node.type.__bhContext, props.value, () =>
      renderToDomInternal(props.children ?? null, doc, runtime, `${path}.p`)
    );
  }

  if (typeof node.type === 'function') {
    return withHooks(runtime, path, () =>
      renderToDomInternal(resolveComponent(node.type, node.props as Record<string, unknown>), doc, runtime, `${path}.0`)
    );
  }

  const element = doc.createElement(node.type);
  const props = node.props as Record<string, unknown>;

  for (const key of Object.keys(props)) {
    setDomProp(element, key, props[key]);
  }

  const children = flatten((props as { children?: VNodeChild | VNodeChild[] }).children);
  if (!VOID_TAGS.has(node.type)) {
    for (let index = 0; index < children.length; index += 1) {
      element.appendChild(renderToDomInternal(children[index], doc, runtime, `${path}.${index}`));
    }
  }

  return element;
}

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
      const nextTree = renderToDomInternal(runtime.currentNode, owner, runtime, '0');
      runtime.root.replaceChildren(nextTree);

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
    rendering: false,
    rerenderQueued: false,
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
  const html = renderToStringInternal(node, runtime, '0');
  cleanupUnmounted(runtime);
  return html;
}

export function renderToDom(node: VNodeChild, doc: Document = document): Node {
  const runtime = createStaticRuntime();
  prepareRuntime(runtime);
  const result = renderToDomInternal(node, doc, runtime, '0');
  cleanupUnmounted(runtime);
  return result;
}

export function mount(root: Element, node: VNodeChild): void {
  const runtime = runtimeByRoot.get(root) ?? createMountedRuntime(root, node);
  runtime.currentNode = node;
  runtimeByRoot.set(root, runtime);
  runtime.scheduleRender();
}

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
  Provider.__bhContext = context;
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

export type { Primitive, VNode, VNodeChild, VNodeType };
export { Fragment };
