// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderToString } from '../../src/jsx/index.js';
import { collectIslands, defineIsland, hydrateIslands } from '../../src/ssr/islands.js';

describe('ssr islands', () => {
  it('collects island payload during server render', () => {
    const CounterIsland = defineIsland(
      ({ value }: { value: number }) => <button>counter:{value}</button>,
      { key: 'collect-counter-island' }
    );

    const collected = collectIslands(() =>
      renderToString(
        <main>
          <CounterIsland value={3} />
        </main>
      )
    );

    expect(collected.result).toContain('data-karui-island="0"');
    expect(collected.islands).toEqual([
      {
        id: 0,
        key: 'collect-counter-island',
        props: { value: 3 },
      },
    ]);
  });

  it('hydrates registered islands on client', async () => {
    defineIsland(
      ({ value }: { value: number }) => <button>counter:{value}</button>,
      { key: 'hydrate-counter-island' }
    );

    document.body.innerHTML = '<div data-karui-island="0" data-karui-island-key="hydrate-counter-island"><button>counter:0</button></div>';
    (window as unknown as Record<string, unknown>).__KARUI_ISLANDS__ = [
      { id: 0, key: 'hydrate-counter-island', props: { value: 7 } },
    ];

    hydrateIslands();
    await Promise.resolve();

    expect(document.body.textContent).toContain('counter:7');
  });

  it('adopts the island server markup rather than rebuilding it', async () => {
    defineIsland(
      ({ value }: { value: number }) => <button id="btn">counter:{value}</button>,
      { key: 'adopt-counter-island' }
    );

    document.body.innerHTML =
      '<div data-karui-island="0" data-karui-island-key="adopt-counter-island"><button id="btn">counter:7</button></div>';
    const serverButton = document.getElementById('btn');

    (window as unknown as Record<string, unknown>).__KARUI_ISLANDS__ = [
      { id: 0, key: 'adopt-counter-island', props: { value: 7 } },
    ];

    hydrateIslands();
    await Promise.resolve();

    expect(document.getElementById('btn')).toBe(serverButton);
  });

  it('leaves markup outside an island untouched', async () => {
    defineIsland(
      ({ value }: { value: number }) => <button>counter:{value}</button>,
      { key: 'static-neighbour-island' }
    );

    document.body.innerHTML =
      '<p id="static">pure html, no js</p>' +
      '<div data-karui-island="0" data-karui-island-key="static-neighbour-island"><button>counter:1</button></div>';
    const staticNode = document.getElementById('static');

    (window as unknown as Record<string, unknown>).__KARUI_ISLANDS__ = [
      { id: 0, key: 'static-neighbour-island', props: { value: 1 } },
    ];

    hydrateIslands();
    await Promise.resolve();

    expect(document.getElementById('static')).toBe(staticNode);
  });
});

