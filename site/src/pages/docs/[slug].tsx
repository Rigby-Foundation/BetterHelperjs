import type { SiteRouteContext } from '@rigbyhost/karui/ssr';
import { Link } from '@rigbyhost/karui/router';

export const meta = (ctx: SiteRouteContext) => ({
  title: `Docs: ${(ctx.data as DocsLoaderData | null)?.slug ?? 'unknown'}`,
  description: 'Per-page metadata built from loader data.',
});

// Parameter sets the prerenderer should emit static HTML for.
export function staticPaths() {
  return [{ slug: 'intro' }, { slug: 'routing' }];
}

interface DocsLoaderData {
  slug: string;
  tab: string;
  loadedAt: string;
}

export function loader(ctx: SiteRouteContext): DocsLoaderData {
  return {
    slug: ctx.params.slug ?? 'unknown',
    tab: ctx.searchParams.get('tab') ?? 'overview',
    loadedAt: new Date().toISOString(),
  };
}

export default function DocsPage(ctx: SiteRouteContext) {
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
