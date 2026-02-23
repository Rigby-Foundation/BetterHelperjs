import type { CounterSiteLayoutProps } from 'better-helperjs/ssr';
import { Link } from 'better-helperjs/router';

const shellStyle = [
  'max-width:960px',
  'margin:0 auto',
  'padding:24px',
  'font-family:ui-sans-serif,system-ui,sans-serif',
].join(';');

export default function Layout({ state, status, title, children, setState }: CounterSiteLayoutProps) {
  return (
    <main style={shellStyle}>
      <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <h1 style="margin:0;">BetterHelper Test Site</h1>
        <span style="padding:2px 8px;border:1px solid #cfd9e8;border-radius:999px;font-size:12px;">HTTP {status}</span>
      </header>

      <nav style="display:flex;gap:10px;margin:0 0 14px;">
        <Link href="/">home</Link>
        <Link href="/about">about</Link>
        <Link href="/docs/intro?tab=overview">docs</Link>
      </nav>

      <p style="margin:0 0 6px;">Page title: <strong>{title}</strong></p>
      <p style="margin:0 0 6px;">URL: <code>{state.url}</code></p>
      <p style="margin:0 0 6px;">Runtime: <code>{state.runtime}</code></p>
      <p style="margin:0 0 10px;">Rendered at: <code>{state.generatedAt}</code></p>

      <button
        id="inc-btn"
        style="padding:8px 12px;cursor:pointer;"
        onClick={() => setState((current) => ({ ...current, count: current.count + 1 }))}
      >
        Count: <span id="count-value">{state.count}</span>
      </button>

      <section style="margin-top:14px;">{children}</section>
    </main>
  );
}
