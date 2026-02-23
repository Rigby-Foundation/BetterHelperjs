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

    expect(collected.result).toContain('data-bh-island="0"');
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

    document.body.innerHTML = '<div data-bh-island="0" data-bh-island-key="hydrate-counter-island"><button>counter:0</button></div>';
    (window as unknown as Record<string, unknown>).__BH_ISLANDS__ = [
      { id: 0, key: 'hydrate-counter-island', props: { value: 7 } },
    ];

    hydrateIslands();
    await Promise.resolve();

    expect(document.body.textContent).toContain('counter:7');
  });
});

