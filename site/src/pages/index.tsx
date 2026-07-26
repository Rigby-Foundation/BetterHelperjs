import type { SiteRouteContext } from '@rigbyhost/karui/ssr';
import { Link } from '@rigbyhost/karui/router';

export const meta = {
  title: 'Home',
  description: 'Karui test site: file-based routing, SSR, hydration.',
  lang: 'en',
  og: { type: 'website' },
  twitter: { card: 'summary' },
};

export default function HomePage(ctx: SiteRouteContext) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">Home Page</h2>
      <p style="margin:0 0 8px;">This is file-based routing. Page loaded from <code>site/src/pages/index.tsx</code>.</p>
      <p style="margin:0 0 8px;">Current path: <code>{ctx.pathname}</code></p>
      <p style="margin:0;">
        Go to docs: <Link href="/docs/intro?tab=api">docs/intro</Link>
        {' | '}
        <Link href="/contact">contact</Link>
      </p>
    </section>
  );
}
