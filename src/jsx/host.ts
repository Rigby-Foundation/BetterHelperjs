/**
 * Host tree: the normalized, component-free representation of a render.
 *
 * A render pass turns the VNode tree into `HostNode[]` (see `normalize` in
 * ./index.ts) — components resolved, fragments and arrays flattened, so every
 * entry maps 1:1 to a DOM node. Three consumers read that tree:
 *
 *   - `serializeHostNodes` — SSR HTML
 *   - `createHostDom` / `patchHostChildren` — client render and updates
 *   - `hydrateHostChildren` — adopting server markup
 *
 * Sharing one normalization between SSR and the client is what makes hydration
 * reliable: both sides walk the identical tree.
 */

export type HostKey = string | number | null;

export interface HostElement {
  kind: 'element';
  tag: string;
  svg: boolean;
  key: HostKey;
  props: Record<string, unknown>;
  children: HostNode[];
  dom?: Element;
}

export interface HostText {
  kind: 'text';
  key: HostKey;
  value: string;
  dom?: Text;
}

export type HostNode = HostElement | HostText;

export type RefLike<T> = { current: T | null } | ((value: T | null) => void) | null | undefined;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Tags whose `value`/`checked`/`selected` must be written as DOM properties.
// Setting the attribute alone does not move the cursor or update a live field.
const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'PROGRESS']);
const FORM_PROPS = new Set(['value', 'checked', 'selected']);

const SVG_NS = 'http://www.w3.org/2000/svg';

// React-style handler names that do not lowercase to the native event name.
const EVENT_ALIASES: Record<string, string> = {
  doubleclick: 'dblclick',
  focusin: 'focusin',
  focusout: 'focusout',
};

// Common camelCase SVG presentation attributes → kebab-case.
const SVG_CAMEL_ATTRS: Record<string, string> = {
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  textAnchor: 'text-anchor',
  textDecoration: 'text-decoration',
  dominantBaseline: 'dominant-baseline',
  alignmentBaseline: 'alignment-baseline',
  baselineShift: 'baseline-shift',
  colorInterpolation: 'color-interpolation',
  colorRendering: 'color-rendering',
  shapeRendering: 'shape-rendering',
  imageRendering: 'image-rendering',
  letterSpacing: 'letter-spacing',
  wordSpacing: 'word-spacing',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontStyle: 'font-style',
  fontWeight: 'font-weight',
  fontVariant: 'font-variant',
  fontStretch: 'font-stretch',
  markerStart: 'marker-start',
  markerMid: 'marker-mid',
  markerEnd: 'marker-end',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  lightingColor: 'lighting-color',
  gradientUnits: 'gradientUnits',
  gradientTransform: 'gradientTransform',
  patternUnits: 'patternUnits',
  patternTransform: 'patternTransform',
  vectorEffect: 'vector-effect',
  paintOrder: 'paint-order',
  viewBox: 'viewBox',
};

interface HandlerHost extends Element {
  __karuiHandlers?: Record<string, EventListener>;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isVoidTag(tag: string): boolean {
  return VOID_TAGS.has(tag);
}

export function normalizeAttrName(key: string): string {
  if (key === 'className') return 'class';
  if (key === 'htmlFor') return 'for';
  return SVG_CAMEL_ATTRS[key] ?? key;
}

export function toStyleString(value: unknown): string {
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

function isReservedProp(key: string): boolean {
  return key === 'children' || key === 'key' || key === 'ref' || key === 'dangerouslySetInnerHTML';
}

function eventNameFor(key: string): string {
  const lowered = key.slice(2).toLowerCase();
  return EVENT_ALIASES[lowered] ?? lowered;
}

function getInnerHtml(props: Record<string, unknown>): string | null {
  const inner = props['dangerouslySetInnerHTML'] as { __html?: unknown } | undefined;
  return inner && typeof inner.__html === 'string' ? inner.__html : null;
}

/* ---------------------------------------------------------------- serialize */

function serializeProps(props: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const key of Object.keys(props)) {
    if (isReservedProp(key)) continue;

    const value = props[key];
    if (value == null || value === false || typeof value === 'function') continue;
    if (key.startsWith('on')) continue;

    const attr = normalizeAttrName(key);

    if (value === true) {
      parts.push(attr);
      continue;
    }

    const attrValue = attr === 'style' ? toStyleString(value) : String(value);
    parts.push(`${attr}="${escapeHtml(attrValue)}"`);
  }

  return parts.length ? ` ${parts.join(' ')}` : '';
}

export function serializeHostNodes(nodes: HostNode[]): string {
  let html = '';

  for (const node of nodes) {
    if (node.kind === 'text') {
      html += escapeHtml(node.value);
      continue;
    }

    const attrs = serializeProps(node.props);

    if (VOID_TAGS.has(node.tag)) {
      html += `<${node.tag}${attrs}>`;
      continue;
    }

    const inner = getInnerHtml(node.props);
    const content = inner !== null ? inner : serializeHostNodes(node.children);
    html += `<${node.tag}${attrs}>${content}</${node.tag}>`;
  }

  return html;
}

/* ------------------------------------------------------------------- events */

// One stable listener per element+type. The active handler lives in a map on
// the element, so inline arrow functions (new identity every render) never
// cause listener churn.
function dispatchEvent(this: Element, event: Event): void {
  (this as HandlerHost).__karuiHandlers?.[event.type]?.call(this, event);
}

function setHandler(element: Element, type: string, handler: unknown): void {
  const host = element as HandlerHost;
  const handlers = host.__karuiHandlers ?? (host.__karuiHandlers = {});

  if (typeof handler === 'function') {
    if (!handlers[type]) {
      element.addEventListener(type, dispatchEvent);
    }
    handlers[type] = handler as EventListener;
    return;
  }

  if (handlers[type]) {
    element.removeEventListener(type, dispatchEvent);
    delete handlers[type];
  }
}

/* -------------------------------------------------------------------- props */

function applyRef(ref: unknown, value: Element | null): void {
  if (typeof ref === 'function') {
    (ref as (node: Element | null) => void)(value);
    return;
  }

  if (ref && typeof ref === 'object' && 'current' in ref) {
    (ref as { current: Element | null }).current = value;
  }
}

function isFormValueProp(element: Element, key: string): boolean {
  return FORM_PROPS.has(key) && FORM_TAGS.has(element.tagName);
}

function patchStyle(element: Element, previous: unknown, next: unknown): void {
  const style = (element as HTMLElement).style as CSSStyleDeclaration & Record<string, string>;

  if (typeof next !== 'object' || next === null || Array.isArray(next)) {
    if (next == null) {
      element.removeAttribute('style');
      return;
    }
    element.setAttribute('style', String(next));
    return;
  }

  const nextRecord = next as Record<string, unknown>;
  const prevRecord = typeof previous === 'object' && previous !== null && !Array.isArray(previous)
    ? (previous as Record<string, unknown>)
    : {};

  for (const key of Object.keys(prevRecord)) {
    if (key in nextRecord) continue;
    style[key] = '';
  }

  for (const key of Object.keys(nextRecord)) {
    const value = nextRecord[key];
    if (Object.is(prevRecord[key], value)) continue;
    style[key] = value == null || value === false ? '' : String(value);
  }
}

function setProp(element: Element, key: string, value: unknown, previous: unknown, svg: boolean): void {
  if (key === 'children' || key === 'key') return;

  if (key === 'ref') {
    if (previous !== value) {
      applyRef(previous, null);
      applyRef(value, element);
    }
    return;
  }

  if (key === 'dangerouslySetInnerHTML') {
    const nextHtml = value && typeof (value as { __html?: unknown }).__html === 'string'
      ? (value as { __html: string }).__html
      : '';
    const prevHtml = previous && typeof (previous as { __html?: unknown }).__html === 'string'
      ? (previous as { __html: string }).__html
      : null;
    if (nextHtml !== prevHtml) {
      element.innerHTML = nextHtml;
    }
    return;
  }

  if (key.startsWith('on')) {
    setHandler(element, eventNameFor(key), value);
    return;
  }

  if (isFormValueProp(element, key)) {
    const field = element as unknown as Record<string, unknown>;
    if (key === 'checked' || key === 'selected') {
      const desired = Boolean(value);
      if (field[key] !== desired) field[key] = desired;
      return;
    }
    const desired = value == null ? '' : String(value);
    if (field.value !== desired) field.value = desired;
    return;
  }

  if (key === 'style' && !svg) {
    patchStyle(element, previous, value);
    return;
  }

  const attr = normalizeAttrName(key);

  if (value == null || value === false) {
    element.removeAttribute(attr);
    return;
  }

  if (value === true) {
    element.setAttribute(attr, '');
    return;
  }

  if (typeof value === 'function') return;

  element.setAttribute(attr, attr === 'style' ? toStyleString(value) : String(value));
}

function removeProp(element: Element, key: string, previous: unknown): void {
  if (isReservedProp(key) && key !== 'ref' && key !== 'dangerouslySetInnerHTML') return;

  if (key === 'ref') {
    applyRef(previous, null);
    return;
  }

  if (key === 'dangerouslySetInnerHTML') {
    element.innerHTML = '';
    return;
  }

  if (key.startsWith('on')) {
    setHandler(element, eventNameFor(key), null);
    return;
  }

  if (isFormValueProp(element, key)) {
    const field = element as unknown as Record<string, unknown>;
    field[key] = key === 'checked' || key === 'selected' ? false : '';
    return;
  }

  element.removeAttribute(normalizeAttrName(key));
}

function patchProps(
  element: Element,
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
  svg: boolean
): void {
  for (const key of Object.keys(oldProps)) {
    if (key === 'children' || key === 'key') continue;
    if (key in newProps) continue;
    removeProp(element, key, oldProps[key]);
  }

  for (const key of Object.keys(newProps)) {
    if (key === 'children' || key === 'key') continue;

    const next = newProps[key];
    const previous = oldProps[key];

    // Form values are re-synced unconditionally: the user may have changed the
    // live DOM value since the last render even when the prop did not move.
    if (!isFormValueProp(element, key) && Object.is(previous, next)) continue;

    setProp(element, key, next, previous, svg);
  }
}

/* ------------------------------------------------------------------- create */

function createElement(node: HostElement, doc: Document): Element {
  const element = node.svg
    ? doc.createElementNS(SVG_NS, node.tag)
    : doc.createElement(node.tag);

  for (const key of Object.keys(node.props)) {
    if (key === 'children' || key === 'key') continue;
    setProp(element, key, node.props[key], undefined, node.svg);
  }

  if (!VOID_TAGS.has(node.tag) && getInnerHtml(node.props) === null) {
    for (const child of node.children) {
      element.appendChild(createHostDom(child, doc));
    }
  }

  node.dom = element;
  return element;
}

export function createHostDom(node: HostNode, doc: Document): Node {
  if (node.kind === 'text') {
    const text = doc.createTextNode(node.value);
    node.dom = text;
    return text;
  }

  return createElement(node, doc);
}

/* -------------------------------------------------------------------- patch */

function isCompatible(previous: HostNode, next: HostNode): boolean {
  if (previous.kind !== next.kind) return false;
  if (previous.kind === 'text') return true;
  return previous.tag === (next as HostElement).tag && previous.svg === (next as HostElement).svg;
}

// Detach refs for a subtree that is leaving the DOM.
function releaseRefs(node: HostNode): void {
  if (node.kind === 'text') return;

  if (node.props['ref'] !== undefined) {
    applyRef(node.props['ref'], null);
  }

  for (const child of node.children) {
    releaseRefs(child);
  }
}

function patchHostNode(previous: HostNode, next: HostNode, doc: Document): void {
  if (next.kind === 'text') {
    const text = (previous as HostText).dom!;
    if (text.data !== next.value) {
      text.data = next.value;
    }
    next.dom = text;
    return;
  }

  const element = (previous as HostElement).dom!;
  const prevElement = previous as HostElement;

  patchProps(element, prevElement.props, next.props, next.svg);
  next.dom = element;

  if (VOID_TAGS.has(next.tag)) return;

  // Raw-HTML elements own their subtree; setProp already rewrote it if needed.
  if (getInnerHtml(next.props) !== null) return;

  patchHostChildren(element, prevElement.children, next.children, doc);
}

export function patchHostChildren(
  parent: Element,
  oldChildren: HostNode[],
  newChildren: HostNode[],
  doc: Document
): void {
  const oldByKey = new Map<string | number, HostNode>();
  const oldUnkeyed: HostNode[] = [];

  for (const child of oldChildren) {
    if (child.key != null && !oldByKey.has(child.key)) {
      oldByKey.set(child.key, child);
      continue;
    }
    oldUnkeyed.push(child);
  }

  const matched = new Set<HostNode>();
  let unkeyedIndex = 0;

  for (const next of newChildren) {
    let previous: HostNode | undefined;

    if (next.key != null) {
      const candidate = oldByKey.get(next.key);
      if (candidate && !matched.has(candidate) && isCompatible(candidate, next)) {
        previous = candidate;
        oldByKey.delete(next.key);
      }
    } else {
      // Unkeyed children reconcile strictly by position among unkeyed siblings.
      const candidate = oldUnkeyed[unkeyedIndex];
      unkeyedIndex += 1;
      if (candidate && !matched.has(candidate) && isCompatible(candidate, next)) {
        previous = candidate;
      }
    }

    if (previous) {
      matched.add(previous);
      patchHostNode(previous, next, doc);
      continue;
    }

    createHostDom(next, doc);
  }

  for (const child of oldChildren) {
    if (matched.has(child)) continue;
    releaseRefs(child);
    const dom = child.dom;
    if (dom && dom.parentNode === parent) {
      parent.removeChild(dom);
    }
  }

  // Position pass, back to front: insertBefore both inserts and moves, and a
  // node already sitting in front of the anchor is left untouched.
  let anchor: Node | null = null;
  for (let index = newChildren.length - 1; index >= 0; index -= 1) {
    const dom = newChildren[index].dom;
    if (!dom) continue;

    if (dom.parentNode !== parent || dom.nextSibling !== anchor) {
      parent.insertBefore(dom, anchor);
    }

    anchor = dom;
  }
}

/* ----------------------------------------------------------------- hydrate */

export interface HydrateReport {
  mismatches: number;
}

function hydrateElement(node: HostElement, element: Element, doc: Document, report: HydrateReport): void {
  // SSR already emitted the attributes; re-applying is idempotent and repairs
  // any server/client divergence. Raw-HTML subtrees are trusted as-is.
  for (const key of Object.keys(node.props)) {
    if (key === 'children' || key === 'key' || key === 'dangerouslySetInnerHTML') continue;
    setProp(element, key, node.props[key], undefined, node.svg);
  }

  node.dom = element;

  if (VOID_TAGS.has(node.tag) || getInnerHtml(node.props) !== null) return;

  hydrateHostChildren(element, node.children, doc, report);
}

export function hydrateHostChildren(
  parent: Element,
  children: HostNode[],
  doc: Document,
  report: HydrateReport = { mismatches: 0 }
): HydrateReport {
  let cursor: Node | null = parent.firstChild;

  for (const child of children) {
    if (child.kind === 'text') {
      // Empty text placeholders (from null/false children) are not serialized
      // by SSR, so materialize one rather than consuming a real sibling.
      if (child.value === '') {
        const text = doc.createTextNode('');
        parent.insertBefore(text, cursor);
        child.dom = text;
        continue;
      }

      if (cursor && cursor.nodeType === 3) {
        const text = cursor as Text;

        if (text.data === child.value) {
          child.dom = text;
          cursor = text.nextSibling;
          continue;
        }

        // The parser merges adjacent text runs into one node; split it back
        // apart so each host text node keeps its own identity.
        if (text.data.startsWith(child.value)) {
          text.splitText(child.value.length);
          child.dom = text;
          cursor = text.nextSibling;
          continue;
        }

        report.mismatches += 1;
        text.data = child.value;
        child.dom = text;
        cursor = text.nextSibling;
        continue;
      }

      report.mismatches += 1;
      const text = doc.createTextNode(child.value);
      parent.insertBefore(text, cursor);
      child.dom = text;
      continue;
    }

    if (cursor && cursor.nodeType === 1 && (cursor as Element).tagName.toLowerCase() === child.tag.toLowerCase()) {
      const element = cursor as Element;
      cursor = element.nextSibling;
      hydrateElement(child, element, doc, report);
      continue;
    }

    report.mismatches += 1;
    parent.insertBefore(createHostDom(child, doc), cursor);
  }

  // Anything the server emitted that this render does not account for.
  while (cursor) {
    const next: Node | null = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = next;
    report.mismatches += 1;
  }

  return report;
}
