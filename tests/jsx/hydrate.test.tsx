// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { hydrate, renderToString, useEffect, useState } from '../../src/jsx/index.js';

function serverRender(node: Parameters<typeof renderToString>[0]): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = renderToString(node);
  document.body.append(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('hydrate', () => {
  it('adopts server markup instead of rebuilding it', () => {
    function Page() {
      return (
        <section>
          <h1 id="title">Karui</h1>
          <p id="body">server text</p>
        </section>
      );
    }

    const root = serverRender(<Page />);
    const title = root.querySelector('#title')!;
    const body = root.querySelector('#body')!;

    hydrate(root, <Page />);

    expect(root.querySelector('#title')).toBe(title);
    expect(root.querySelector('#body')).toBe(body);
  });

  it('wires event handlers onto the adopted nodes', () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return (
        <button id="btn" onClick={() => setCount((value) => value + 1)}>
          count:{count}
        </button>
      );
    }

    const root = serverRender(<Counter />);
    const button = root.querySelector<HTMLButtonElement>('#btn')!;
    expect(button.textContent).toBe('count:0');

    hydrate(root, <Counter />);
    button.click();

    expect(root.querySelector('#btn')).toBe(button);
    expect(button.textContent).toBe('count:1');
  });

  it('splits merged text runs so each interpolation keeps its own node', () => {
    function Line({ name }: { name: string }) {
      return <p id="line">hello {name}, welcome</p>;
    }

    const root = serverRender(<Line name="ada" />);
    // The parser merges the three runs into a single text node.
    expect(root.querySelector('#line')!.childNodes.length).toBe(1);

    const line = root.querySelector('#line')!;
    hydrate(root, <Line name="ada" />);

    expect(root.querySelector('#line')).toBe(line);
    expect(line.childNodes.length).toBe(3);
    expect(line.textContent).toBe('hello ada, welcome');
  });

  it('updates only the changed run after hydrating merged text', () => {
    let rename: (value: string) => void = () => {};

    function Line() {
      const [name, set] = useState('ada');
      rename = set;
      return <p id="line">hello {name}, welcome</p>;
    }

    const root = serverRender(<Line />);
    const line = root.querySelector('#line')!;

    hydrate(root, <Line />);
    const runs = [...line.childNodes];

    rename('grace');

    expect(line.textContent).toBe('hello grace, welcome');
    expect([...line.childNodes]).toEqual(runs);
  });

  it('runs effects after hydration', () => {
    const log: string[] = [];

    function Page() {
      useEffect(() => {
        log.push('effect');
      }, []);
      return <span>page</span>;
    }

    const root = serverRender(<Page />);
    hydrate(root, <Page />);

    expect(log).toEqual(['effect']);
  });

  it('repairs a server/client mismatch instead of leaving stale markup', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p id="stale">from an older deploy</p><span>orphan</span>';
    document.body.append(root);

    hydrate(root, <p id="fresh">current</p>);

    expect(root.innerHTML).toBe('<p id="fresh">current</p>');
  });

  it('diffs normally once hydrated', () => {
    let bump: () => void = () => {};

    function App() {
      const [count, setCount] = useState(0);
      bump = () => setCount((value) => value + 1);
      return (
        <div>
          <input id="field" type="text" />
          <span id="out">{count}</span>
        </div>
      );
    }

    const root = serverRender(<App />);
    hydrate(root, <App />);

    const field = root.querySelector<HTMLInputElement>('#field')!;
    field.focus();
    field.value = 'typed';

    bump();

    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('typed');
    expect(root.querySelector('#out')?.textContent).toBe('1');
  });

  it('adopts keyed lists without recreating them', () => {
    const ids = ['a', 'b', 'c'];

    function List() {
      return <ul>{ids.map((id) => <li key={id} id={`item-${id}`}>{id}</li>)}</ul>;
    }

    const root = serverRender(<List />);
    const nodes = ids.map((id) => root.querySelector(`#item-${id}`));

    hydrate(root, <List />);

    ids.forEach((id, index) => {
      expect(root.querySelector(`#item-${id}`)).toBe(nodes[index]);
    });
  });

  it('materializes placeholders for conditional children not present in SSR', () => {
    function App({ show }: { show: boolean }) {
      return (
        <div>
          {show ? <em id="extra">extra</em> : null}
          <span id="always">always</span>
        </div>
      );
    }

    const root = serverRender(<App show={false} />);
    const always = root.querySelector('#always')!;

    hydrate(root, <App show={false} />);

    expect(root.querySelector('#always')).toBe(always);
    expect(root.querySelector('#extra')).toBeNull();
  });
});
