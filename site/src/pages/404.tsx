import type { SiteRouteContext } from '@rigbyhost/karui/ssr';

export const meta = {
  title: '404',
};

export default function NotFoundPage(ctx: SiteRouteContext) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">404</h2>
      <p style="margin:0;">No page for <code>{ctx.pathname}</code></p>
    </section>
  );
}
