import type { FileLayoutProps } from '@rigbyhost/karui/router/file-based';
import type { RenderState } from '@rigbyhost/karui/ssr';

const sectionStyle = [
  'margin-top:12px',
  'padding:12px',
  'border:1px solid #dbe4f0',
  'border-radius:12px',
  'background:#f8fbff',
].join(';');

export default function PagesLayout({ children, ctx }: FileLayoutProps<RenderState>) {
  return (
    <section style={sectionStyle}>
      <p style="margin:0 0 10px;font-size:12px;color:#476078;">
        Pages layout active for: <code>{ctx.pathname}</code>
      </p>
      {children}
    </section>
  );
}
