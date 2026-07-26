import { escapeHtml } from '../jsx/host.js';
import type { RouteMeta } from '../router/index.js';

export type { RouteMeta };

type TagAttrs = Record<string, string | number | boolean | undefined>;

function renderTag(tag: string, attrs: TagAttrs): string {
  const parts: string[] = [];

  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (value == null || value === false) continue;

    if (value === true) {
      parts.push(key);
      continue;
    }

    parts.push(`${key}="${escapeHtml(String(value))}"`);
  }

  return parts.length ? `<${tag} ${parts.join(' ')}>` : `<${tag}>`;
}

function renderNamespaced(prefix: string, values: Record<string, string | number | undefined> | undefined, attr: 'property' | 'name'): string[] {
  if (!values) return [];

  const tags: string[] = [];

  for (const key of Object.keys(values)) {
    const value = values[key];
    if (value == null) continue;
    tags.push(renderTag('meta', { [attr]: `${prefix}:${key}`, content: value }));
  }

  return tags;
}

/**
 * Render a route's metadata into `<head>` markup.
 *
 * `title` wins over `meta.title` so the caller can apply a site-wide prefix.
 * Open Graph gains a sensible `og:title`/`og:description` fallback rather than
 * making every page repeat itself.
 */
export function renderHead(meta: RouteMeta | undefined, title: string): string {
  const resolved = meta ?? {};
  const tags: string[] = [`<title>${escapeHtml(title)}</title>`];

  if (resolved.description) {
    tags.push(renderTag('meta', { name: 'description', content: resolved.description }));
  }

  if (resolved.robots) {
    tags.push(renderTag('meta', { name: 'robots', content: resolved.robots }));
  }

  if (resolved.canonical) {
    tags.push(renderTag('link', { rel: 'canonical', href: resolved.canonical }));
  }

  const og: Record<string, string | number | undefined> = {
    title,
    ...(resolved.description ? { description: resolved.description } : {}),
    ...(resolved.canonical ? { url: resolved.canonical } : {}),
    ...resolved.og,
  };
  tags.push(...renderNamespaced('og', og, 'property'));

  if (resolved.twitter) {
    tags.push(...renderNamespaced('twitter', resolved.twitter, 'name'));
  }

  for (const attrs of resolved.meta ?? []) {
    tags.push(renderTag('meta', attrs));
  }

  for (const attrs of resolved.link ?? []) {
    tags.push(renderTag('link', attrs));
  }

  return tags.join('');
}

/** Rewrite the `lang` attribute on a template's `<html>` tag. */
export function applyHtmlLang(template: string, lang: string | undefined): string {
  if (!lang) return template;

  const escaped = escapeHtml(lang);

  return template.replace(/<html\b([^>]*)>/i, (match, attrs: string) => {
    if (/\blang\s*=/i.test(attrs)) {
      return `<html${attrs.replace(/\blang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `lang="${escaped}"`)}>`;
    }
    return `<html${attrs} lang="${escaped}">`;
  });
}
