import type { CounterSiteErrorContext } from 'better-helperjs/ssr';

export const meta = {
  title: 'Error',
};

export default function ErrorPage(ctx: CounterSiteErrorContext) {
  const message = ctx.error instanceof Error ? ctx.error.message : String(ctx.error);

  return (
    <section>
      <h2 style="margin:0 0 8px;">Error</h2>
      <p style="margin:0 0 8px;">Unhandled route error for <code>{ctx.pathname}</code></p>
      <pre style="margin:0;padding:10px;border:1px solid #eed3d3;border-radius:8px;background:#fff7f7;">
        {message}
      </pre>
    </section>
  );
}

