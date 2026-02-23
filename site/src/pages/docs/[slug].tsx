import type { CounterSiteRouteContext } from 'better-helperjs/ssr';
import { Link } from 'better-helperjs/router';

export const meta = {
  title: 'Docs',
};

interface DocsLoaderData {
  slug: string;
  tab: string;
  loadedAt: string;
}

export function loader(ctx: CounterSiteRouteContext): DocsLoaderData {
  return {
    slug: ctx.params.slug ?? 'unknown',
    tab: ctx.searchParams.get('tab') ?? 'overview',
    loadedAt: new Date().toISOString(),
  };
}

export default function DocsPage(ctx: CounterSiteRouteContext) {
  const data = (ctx.data ?? null) as DocsLoaderData | null;
  const slug = data?.slug ?? ctx.params.slug ?? 'unknown';
  const tab = data?.tab ?? ctx.searchParams.get('tab') ?? 'overview';

  return (
    <section>
      <h2 style="margin:0 0 8px;">Docs</h2>
      <p style="margin:0 0 8px;">Slug: <code>{slug}</code></p>
      <p style="margin:0 0 8px;">Tab: <code>{tab}</code></p>
      <p style="margin:0 0 8px;">Loaded at: <code>{data?.loadedAt ?? 'n/a'}</code></p>
      <p style="margin:0;">
        <Link href="/docs/intro?tab=overview">overview</Link>
        {' | '}
        <Link href="/docs/intro?tab=api">api</Link>
      </p>
    </section>
  );
}
