import { Link } from '@rigbyhost/karui/router';
import type { FileLayoutProps } from '@rigbyhost/karui/router/file-based';
import type { RenderState } from '@rigbyhost/karui/ssr';

const docsStyle = [
  'margin-top:10px',
  'padding:10px',
  'border:1px dashed #b8c7dd',
  'border-radius:10px',
  'background:#fff',
].join(';');

export default function DocsLayout({ children }: FileLayoutProps<RenderState>) {
  return (
    <div style={docsStyle}>
      <p style="margin:0 0 8px;font-size:12px;">
        Docs nested layout:
        {' '}
        <Link href="/docs/intro?tab=overview">intro</Link>
        {' · '}
        <Link href="/docs/routing?tab=api">routing</Link>
      </p>
      {children}
    </div>
  );
}
