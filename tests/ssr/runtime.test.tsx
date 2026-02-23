// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createRouter, notFound } from '../../src/router/index.js';
import { mountWithRouter, type ShellRenderProps } from '../../src/ssr/runtime.js';

interface TestState {
  url: string;
  count: number;
}

function Shell({ state, content, setState }: ShellRenderProps<TestState>) {
  return (
    <main>
      <button id="inc" onClick={() => setState((current) => ({ ...current, count: current.count + 1 }))}>
        count:{state.count}
      </button>
      <section id="page">{content}</section>
    </main>
  );
}

describe('ssr runtime mountWithRouter', () => {
  it('keeps state across client-side navigation and runs loader only on url changes', async () => {
    history.replaceState(null, '', '/');

    const router = createRouter<TestState>([
      { path: '/', title: 'home', component: () => <p>home</p> },
      { path: '/about', title: 'about', component: () => <p>about</p> },
    ]);

    const root = document.createElement('div');
    document.body.append(root);

    const loadCalls: string[] = [];

    const stop = mountWithRouter({
      root,
      router,
      initialState: { url: '/', count: 0 },
      shell: Shell,
      getUrl: (state) => state.url,
      setUrl: (state, url) => ({ ...state, url }),
      loadData: async (url) => {
        loadCalls.push(url);
        return { url };
      },
    });

    await Promise.resolve();

    root.querySelector<HTMLButtonElement>('#inc')?.click();
    root.querySelector<HTMLButtonElement>('#inc')?.click();
    await Promise.resolve();

    expect(root.textContent).toContain('count:2');
    expect(loadCalls).toEqual(['/']);

    router.navigate('/about');
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain('about');
    expect(root.textContent).toContain('count:2');
    expect(loadCalls).toEqual(['/', '/about']);

    stop();
  });

  it('handles loader errors via notFound/error boundaries', async () => {
    history.replaceState(null, '', '/');

    const router = createRouter<TestState>([
      { path: '/', title: 'home', component: () => <p>home</p> },
      { path: '/missing', title: 'missing', component: () => <p>missing</p> },
      { path: '/broken', title: 'broken', component: () => <p>broken</p> },
    ], {
      notFound: () => <p>nf</p>,
      errorBoundary: (ctx) => <p>err:{String((ctx.error as Error).message)}</p>,
    });

    const root = document.createElement('div');
    document.body.append(root);

    const stop = mountWithRouter({
      root,
      router,
      initialState: { url: '/', count: 0 },
      shell: Shell,
      getUrl: (state) => state.url,
      setUrl: (state, url) => ({ ...state, url }),
      loadData: async (url) => {
        if (url === '/missing') {
          notFound();
        }
        if (url === '/broken') {
          throw new Error('load-failed');
        }
        return { ok: true };
      },
    });

    await Promise.resolve();
    router.navigate('/missing');
    await Promise.resolve();
    await Promise.resolve();
    expect(root.textContent).toContain('nf');

    router.navigate('/broken');
    await Promise.resolve();
    await Promise.resolve();
    expect(root.textContent).toContain('err:load-failed');

    stop();
  });
});
