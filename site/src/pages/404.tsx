import type { CounterSiteRouteContext } from 'better-helperjs/ssr';

export const meta = {
  title: '404',
};

export default function NotFoundPage(ctx: CounterSiteRouteContext) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">404</h2>
      <p style="margin:0;">No page for <code>{ctx.pathname}</code></p>
    </section>
  );
}
