import { serializeState, type RenderState } from '../core/state.js';
import { applyHtmlLang } from './head.js';

export type HydrationMode = 'full' | 'islands' | 'none';

/** The shape a site's `render()` returns, as far as HTML assembly cares. */
export interface RenderedPage {
  html: string;
  head: string;
  status: number;
  lang?: string;
  redirect?: { location: string; status: number };
  state?: RenderState;
  hydrationMode?: HydrationMode;
  stateKey?: string;
  statePayload?: string;
  islandsKey?: string;
  islandsPayloadJson?: string;
  dataKey?: string;
  dataPayload?: string;
}

export interface ManifestChunk {
  file: string;
  css?: string[];
}

export type Manifest = Record<string, ManifestChunk>;

export function resolveHydrationMode(rendered: RenderedPage): HydrationMode {
  return rendered.hydrationMode ?? 'full';
}

export function resolveStatePayload(rendered: RenderedPage): string {
  if (typeof rendered.statePayload === 'string') {
    return rendered.statePayload;
  }

  if (rendered.state) {
    return serializeState(rendered.state);
  }

  return 'null';
}

export function resolveBootstrapScripts(rendered: RenderedPage): string {
  const mode = resolveHydrationMode(rendered);
  if (mode === 'none') return '';

  if (mode === 'islands') {
    const islandsKey = rendered.islandsKey ?? '__KARUI_ISLANDS__';
    const islandsPayload = rendered.islandsPayloadJson ?? '[]';
    return `<script>window[${JSON.stringify(islandsKey)}]=${islandsPayload}</script>`;
  }

  // Full hydration replays the server's loader result so the first client
  // render matches the markup instead of refetching and flashing.
  if (rendered.dataKey && rendered.dataPayload && rendered.dataPayload !== 'null') {
    return `<script>window[${JSON.stringify(rendered.dataKey)}]=${rendered.dataPayload}</script>`;
  }

  return '';
}

export function applyTemplate(
  template: string,
  rendered: RenderedPage,
  headScripts: string,
  clientScript: string
): string {
  const stateAssignmentPattern = /window\.__SITE_STATE__\s*=\s*<!--app-state-->/;
  const stateKey = rendered.stateKey;
  const withState = stateKey && stateAssignmentPattern.test(template)
    ? template.replace(stateAssignmentPattern, `window[${JSON.stringify(stateKey)}]=<!--app-state-->`)
    : template;

  return applyHtmlLang(withState, rendered.lang)
    .replace('<!--app-head-->', `${rendered.head}\n${headScripts}`)
    .replace('<!--app-html-->', rendered.html)
    .replace('<!--app-state-->', resolveStatePayload(rendered))
    .replace('<!--app-bootstrap-->', resolveBootstrapScripts(rendered))
    .replace('<!--app-scripts-->', clientScript);
}

export function resolveManifestEntryKey(manifest: Manifest, preferred: string): string | null {
  if (manifest[preferred]) return preferred;

  for (const key of Object.keys(manifest)) {
    if (key.endsWith(preferred)) return key;
  }

  return null;
}

export function createPreloadTags(manifest: Manifest, entry: string, includeScript = true): string {
  const chunk = manifest[entry];
  if (!chunk) return '';

  const tags: string[] = [];

  if (Array.isArray(chunk.css)) {
    for (const cssFile of chunk.css) {
      tags.push(`<link rel="stylesheet" href="/${cssFile}">`);
    }
  }

  if (includeScript) {
    tags.push(`<script type="module" src="/${chunk.file}"></script>`);
  }

  return tags.join('');
}
