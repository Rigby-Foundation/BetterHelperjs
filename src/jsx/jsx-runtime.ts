export type Primitive = string | number | boolean | null | undefined;

export type VNodeType<P = Record<string, unknown>> =
  | string
  | ((props: P & { children?: VNodeChild | VNodeChild[] }) => VNodeChild)
  | typeof Fragment;

export interface VNode<P = Record<string, unknown>> {
  type: VNodeType<P>;
  props: P & { children?: VNodeChild | VNodeChild[] };
  key: string | number | null;
}

export type VNodeChild = VNode | Primitive | VNodeChild[];

export const Fragment = Symbol.for('betterhelper.fragment');

function normalizeProps<P extends Record<string, unknown>>(
  props: P | null | undefined
): P & { children?: VNodeChild | VNodeChild[] } {
  if (!props) {
    return {} as P & { children?: VNodeChild | VNodeChild[] };
  }

  return props as P & { children?: VNodeChild | VNodeChild[] };
}

export function jsx<P extends Record<string, unknown>>(
  type: VNodeType<P>,
  props: P | null,
  key?: string | number
): VNode<P> {
  return {
    type,
    props: normalizeProps(props),
    key: key ?? null,
  };
}

export function jsxs<P extends Record<string, unknown>>(
  type: VNodeType<P>,
  props: P | null,
  key?: string | number
): VNode<P> {
  return jsx(type, props, key);
}

export function jsxDEV<P extends Record<string, unknown>>(
  type: VNodeType<P>,
  props: P | null,
  key?: string | number
): VNode<P> {
  return jsx(type, props, key);
}

export namespace JSX {
  export type Element = VNodeChild;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
}
