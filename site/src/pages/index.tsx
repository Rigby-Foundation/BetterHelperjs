import type { CounterSiteRouteContext } from 'better-helperjs/ssr';
import { Link } from 'better-helperjs/router';

export const meta = {
  title: 'Home',
};

export default function HomePage(ctx: CounterSiteRouteContext) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">Home Page</h2>
      <p style="margin:0 0 8px;">This is file-based routing. Page loaded from <code>site/src/pages/index.tsx</code>.</p>
      <p style="margin:0 0 8px;">Current path: <code>{ctx.pathname}</code></p>
      <p style="margin:0;">
        Go to docs: <Link href="/docs/intro?tab=api">docs/intro</Link>
      </p>
    </section>
  );
}
