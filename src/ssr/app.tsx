import { mount, renderToString } from '../jsx/index.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import { createRouter, Link, type RouteContext } from '../router/index.js';
import type { SsrAppState } from './view.js';

function appStyles(): string {
  return [
    'max-width:900px',
    'margin:0 auto',
    'padding:24px',
    'font-family:ui-sans-serif,system-ui,sans-serif',
  ].join(';');
}

function badgeStyles(): string {
  return [
    'display:inline-block',
    'padding:2px 8px',
    'border:1px solid #d0dae7',
    'border-radius:999px',
    'font-size:12px',
  ].join(';');
}

function HomePage(ctx: RouteContext<SsrAppState>) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">Home</h2>
      <p style="margin:0 0 8px;">Framework-native JSX runtime works without React/Preact.</p>
      <p style="margin:0 0 8px;">
        Try route param page: <Link href="/docs/getting-started">docs/getting-started</Link>
      </p>
      <p style="margin:0;">Current path: <code>{ctx.pathname}</code></p>
    </section>
  );
}

function DocsPage(ctx: RouteContext<SsrAppState>) {
  const slug = ctx.params.slug ?? 'unknown';
  const tab = ctx.searchParams.get('tab') ?? 'overview';

  return (
    <section>
      <h2 style="margin:0 0 8px;">Docs</h2>
      <p style="margin:0 0 8px;">slug: <code>{slug}</code></p>
      <p style="margin:0 0 8px;">tab: <code>{tab}</code></p>
      <p style="margin:0;">
        <Link href="/docs/getting-started?tab=overview">overview</Link>
        {' | '}
        <Link href="/docs/getting-started?tab=api">api</Link>
      </p>
    </section>
  );
}

function AboutPage(ctx: RouteContext<SsrAppState>) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">About</h2>
      <p style="margin:0;">Runtime detected on render: <code>{ctx.state.runtime}</code></p>
    </section>
  );
}

function NotFoundPage(ctx: RouteContext<SsrAppState>) {
  return (
    <section>
      <h2 style="margin:0 0 8px;">404</h2>
      <p style="margin:0;">No route for <code>{ctx.pathname}</code></p>
    </section>
  );
}

const appRouter = createRouter<SsrAppState>(
  [
    { path: '/', title: 'Home', component: HomePage },
    { path: '/docs/:slug', title: 'Docs', component: DocsPage },
    { path: '/about', title: 'About', component: AboutPage },
  ],
  {
    notFound: NotFoundPage,
    notFoundTitle: '404',
  }
);

interface AppShellProps {
  state: SsrAppState;
  pageTitle: string;
  status: number;
  children: VNodeChild;
  onIncrement?: () => void;
}

function AppShell({ state, pageTitle, status, children, onIncrement }: AppShellProps) {
  return (
    <main style={appStyles()}>
      <header style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <h1 style="margin:0;">BetterHelper SSR + JSX Router</h1>
        <span style={badgeStyles()}>HTTP {status}</span>
      </header>

      <nav style="display:flex;gap:10px;margin:0 0 16px;">
        <Link href="/">home</Link>
        <Link href="/about">about</Link>
        <Link href="/docs/getting-started?tab=overview">docs</Link>
      </nav>

      <p style="margin:0 0 6px;">Page: <strong>{pageTitle}</strong></p>
      <p style="margin:0 0 6px;">URL: <code>{state.url}</code></p>
      <p style="margin:0 0 6px;">Runtime: <code>{state.runtime}</code></p>
      <p style="margin:0 0 14px;">Rendered at: <code>{state.generatedAt}</code></p>

      <button id="inc-btn" style="padding:8px 12px;cursor:pointer;" onClick={onIncrement}>
        Count: <span id="count-value">{state.count}</span>
      </button>

      <div style="margin-top:14px;">{children}</div>
    </main>
  );
}

export interface AppRenderResult {
  html: string;
  title: string;
  status: number;
}

export function renderApp(state: SsrAppState): AppRenderResult {
  const route = appRouter.render(state.url, state);
  const title = route.title ? `BetterHelper SSR - ${route.title}` : 'BetterHelper SSR';

  const node = (
      <AppShell
        state={state}
        pageTitle={route.title || 'Untitled'}
        status={route.status}
        children={route.node}
      />
  );

  return {
    html: renderToString(node),
    title,
    status: route.status,
  };
}

export function mountApp(root: Element, initialState: SsrAppState): () => void {
  let state = { ...initialState };

  const rerender = (nextUrl?: string): void => {
    if (nextUrl) state.url = nextUrl;

    const route = appRouter.render(state.url, state);
    const title = route.title ? `BetterHelper SSR - ${route.title}` : 'BetterHelper SSR';

    const node = (
      <AppShell
        state={state}
        pageTitle={route.title || 'Untitled'}
        status={route.status}
        children={route.node}
        onIncrement={() => {
          state = { ...state, count: state.count + 1 };
          rerender();
        }}
      />
    );

    mount(root, node);
    document.title = title;
  };

  const stop = appRouter.start((nextUrl) => {
    rerender(nextUrl);
  });

  rerender(initialState.url || '/');

  return () => {
    stop();
  };
}

export { appRouter };
