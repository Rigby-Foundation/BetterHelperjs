import type { FileLayoutProps } from 'better-helperjs/router/file-based';
import type { CounterSiteState } from 'better-helperjs/ssr';

const sectionStyle = [
  'margin-top:12px',
  'padding:12px',
  'border:1px solid #dbe4f0',
  'border-radius:12px',
  'background:#f8fbff',
].join(';');

export default function PagesLayout({ children, ctx }: FileLayoutProps<CounterSiteState>) {
  return (
    <section style={sectionStyle}>
      <p style="margin:0 0 10px;font-size:12px;color:#476078;">
        Pages layout active for: <code>{ctx.pathname}</code>
      </p>
      {children}
    </section>
  );
}
