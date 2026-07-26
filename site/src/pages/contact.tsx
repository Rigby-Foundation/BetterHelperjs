import { redirect } from '@rigbyhost/karui/router';
import type { SiteActionContext, SiteRouteContext } from '@rigbyhost/karui/ssr';

export const meta = {
  title: 'Contact',
  description: 'A form that submits and redirects with no client JavaScript.',
  og: { type: 'website' },
};

interface ActionResult {
  error?: string;
}

export async function action(ctx: SiteActionContext): Promise<ActionResult | undefined> {
  const message = String(ctx.request.formData.message ?? '').trim();

  if (!message) {
    return { error: 'Message cannot be empty' };
  }

  // Persist here in a real app, then POST/redirect/GET so reload is safe.
  redirect(`/contact?sent=${encodeURIComponent(message)}`, 303);
}

export default function ContactPage(ctx: SiteRouteContext) {
  const result = ctx.actionData as ActionResult | undefined;
  const sent = ctx.searchParams.get('sent');

  return (
    <section>
      <h2 style="margin:0 0 8px;">Contact</h2>
      {sent ? <p style="margin:0 0 8px;color:#1a7f37;">Received: <code>{sent}</code></p> : null}
      {result?.error ? <p style="margin:0 0 8px;color:#b3261e;">{result.error}</p> : null}
      <form method="post" style="display:flex;gap:8px;flex-wrap:wrap;">
        <input name="message" placeholder="Your message" style="padding:8px;flex:1;min-width:200px;" />
        <button type="submit" style="padding:8px 12px;cursor:pointer;">Send</button>
      </form>
    </section>
  );
}
