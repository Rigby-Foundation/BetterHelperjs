import type { SiteRouteContext } from '@rigbyhost/karui/ssr';

export const meta = {
  title: 'About',
};

interface AboutLoaderData {
  loadedAt: string;
  runtime: string;
}

export function loader(ctx: SiteRouteContext): AboutLoaderData {
  return {
    loadedAt: new Date().toISOString(),
    runtime: ctx.state.runtime,
  };
}

export default function AboutPage(ctx: SiteRouteContext) {
  const data = (ctx.data ?? null) as AboutLoaderData | null;

  return (
    <section>
      <h2 style="margin:0 0 8px;">About</h2>
      <p style="margin:0 0 8px;">Runtime from SSR state: <code>{ctx.state.runtime}</code></p>
      <p style="margin:0;">Rendered URL: <code>{ctx.state.url}</code></p>
      <p style="margin:8px 0 0;">
        Loaded at: <code>{data?.loadedAt ?? 'n/a'}</code>
      </p>
    </section>
  );
}
