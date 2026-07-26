// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { mount, unmount, useEffect, useRef, useState } from '../../src/jsx/index.js';

function createRoot(): HTMLDivElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('reconciler: DOM preservation', () => {
  it('keeps element identity across a state update', () => {
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

    const root = createRoot();
    mount(root, <App />);

    const before = root.querySelector('#field');
    bump();

    expect(root.querySelector('#field')).toBe(before);
    expect(root.querySelector('#out')?.textContent).toBe('1');
  });

  it('preserves focus and uncontrolled input value across a state update', () => {
    let bump: () => void = () => {};

    function App() {
      const [count, setCount] = useState(0);
      bump = () => setCount((value) => value + 1);
      return (
        <form>
          <input id="field" type="text" />
          <span>{count}</span>
        </form>
      );
    }

    const root = createRoot();
    mount(root, <App />);

    const field = root.querySelector<HTMLInputElement>('#field')!;
    field.focus();
    field.value = 'typed by user';
    expect(document.activeElement).toBe(field);

    bump();

    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('typed by user');
  });

  it('updates text in place rather than replacing the node', () => {
    let bump: () => void = () => {};

    function App() {
      const [count, setCount] = useState(0);
      bump = () => setCount((value) => value + 1);
      return <p id="p">count is {count}</p>;
    }

    const root = createRoot();
    mount(root, <App />);

    const paragraph = root.querySelector('#p')!;
    const textNodes = [...paragraph.childNodes];
    bump();

    expect(root.querySelector('#p')).toBe(paragraph);
    expect([...paragraph.childNodes]).toEqual(textNodes);
    expect(paragraph.textContent).toBe('count is 1');
  });

  it('adds and removes attributes without recreating the element', () => {
    let setOn: (value: boolean) => void = () => {};

    function App() {
      const [on, set] = useState(true);
      setOn = set;
      return <div id="box" class={on ? 'active' : undefined} data-on={on ? 'yes' : undefined} />;
    }

    const root = createRoot();
    mount(root, <App />);

    const box = root.querySelector('#box')!;
    expect(box.getAttribute('class')).toBe('active');
    expect(box.getAttribute('data-on')).toBe('yes');

    setOn(false);

    expect(root.querySelector('#box')).toBe(box);
    expect(box.hasAttribute('class')).toBe(false);
    expect(box.hasAttribute('data-on')).toBe(false);
  });

  it('diffs object styles instead of clobbering them', () => {
    let setBig: (value: boolean) => void = () => {};

    function App() {
      const [big, set] = useState(false);
      setBig = set;
      return <div id="box" style={{ color: 'red', fontSize: big ? '20px' : '10px' }} />;
    }

    const root = createRoot();
    mount(root, <App />);

    const box = root.querySelector<HTMLDivElement>('#box')!;
    expect(box.style.fontSize).toBe('10px');

    setBig(true);

    expect(root.querySelector('#box')).toBe(box);
    expect(box.style.fontSize).toBe('20px');
    expect(box.style.color).toBe('red');
  });

  it('swaps inline event handlers without stacking listeners', () => {
    const calls: number[] = [];
    let bump: () => void = () => {};

    function App() {
      const [count, setCount] = useState(0);
      bump = () => setCount((value) => value + 1);
      return (
        <button id="btn" onClick={() => calls.push(count)}>
          {count}
        </button>
      );
    }

    const root = createRoot();
    mount(root, <App />);

    const button = root.querySelector<HTMLButtonElement>('#btn')!;
    button.click();
    bump();
    button.click();
    bump();
    button.click();

    // One call per click — a fresh listener per render would give 1, 2, 3.
    expect(calls).toEqual([0, 1, 2]);
    expect(root.querySelector('#btn')).toBe(button);
  });

  it('re-syncs a controlled value the user has edited', () => {
    let setValue: (value: string) => void = () => {};

    function App() {
      const [value, set] = useState('server');
      setValue = set;
      return <input id="field" value={value} />;
    }

    const root = createRoot();
    mount(root, <App />);

    const field = root.querySelector<HTMLInputElement>('#field')!;
    expect(field.value).toBe('server');

    field.value = 'user typed';
    setValue('reset');

    expect(field.value).toBe('reset');
  });

  it('attaches and releases refs', () => {
    let toggle: (value: boolean) => void = () => {};
    let captured: { current: Element | null } | null = null;

    function App() {
      const [show, set] = useState(true);
      const ref = useRef<Element | null>(null);
      captured = ref;
      toggle = set;
      return <div>{show ? <span id="target" ref={ref} /> : null}</div>;
    }

    const root = createRoot();
    mount(root, <App />);

    expect(captured!.current).toBe(root.querySelector('#target'));

    toggle(false);

    expect(root.querySelector('#target')).toBeNull();
    expect(captured!.current).toBeNull();
  });

  it('runs effect cleanups on unmount and empties the root', () => {
    const log: string[] = [];

    function Child() {
      useEffect(() => {
        log.push('mount');
        return () => log.push('cleanup');
      }, []);
      return <span>child</span>;
    }

    const root = createRoot();
    mount(root, <Child />);
    expect(log).toEqual(['mount']);

    unmount(root);

    expect(log).toEqual(['mount', 'cleanup']);
    expect(root.childNodes.length).toBe(0);
  });
});

describe('reconciler: keys', () => {
  it('moves keyed DOM nodes instead of recreating them', () => {
    let order = ['a', 'b', 'c'];
    let rerender: () => void = () => {};

    function List() {
      const [, tick] = useState(0);
      rerender = () => tick((n) => n + 1);
      return (
        <ul>
          {order.map((id) => (
            <li key={id} id={`item-${id}`}>
              {id}
            </li>
          ))}
        </ul>
      );
    }

    const root = createRoot();
    mount(root, <List />);

    const nodes = Object.fromEntries(
      order.map((id) => [id, root.querySelector(`#item-${id}`)])
    );

    order = ['c', 'a', 'b'];
    rerender();

    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['c', 'a', 'b']);
    for (const id of ['a', 'b', 'c']) {
      expect(root.querySelector(`#item-${id}`)).toBe(nodes[id]);
    }
  });

  it('keeps hook state with the keyed item across a reorder', () => {
    let order = ['a', 'b'];
    let rerender: () => void = () => {};

    function Item({ label }: { label: string }) {
      // Captured once, at first mount — reveals which store the item is using.
      const [mountedAs] = useState(() => label);
      return <li>{`${label}:${mountedAs}`}</li>;
    }

    function List() {
      const [, tick] = useState(0);
      rerender = () => tick((n) => n + 1);
      return <ul>{order.map((id) => <Item key={id} label={id} />)}</ul>;
    }

    const root = createRoot();
    mount(root, <List />);
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a:a', 'b:b']);

    order = ['b', 'a'];
    rerender();

    // Each item keeps its own store: state follows the key, not the position.
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['b:b', 'a:a']);
  });

  it('removes the right node when a keyed item disappears', () => {
    let order = ['a', 'b', 'c'];
    let rerender: () => void = () => {};

    function List() {
      const [, tick] = useState(0);
      rerender = () => tick((n) => n + 1);
      return <ul>{order.map((id) => <li key={id} id={`item-${id}`}>{id}</li>)}</ul>;
    }

    const root = createRoot();
    mount(root, <List />);

    const first = root.querySelector('#item-a');
    const last = root.querySelector('#item-c');

    order = ['a', 'c'];
    rerender();

    expect(root.querySelector('#item-b')).toBeNull();
    expect(root.querySelector('#item-a')).toBe(first);
    expect(root.querySelector('#item-c')).toBe(last);
  });

  it('prepends a keyed item without disturbing existing nodes', () => {
    let order = ['b', 'c'];
    let rerender: () => void = () => {};

    function List() {
      const [, tick] = useState(0);
      rerender = () => tick((n) => n + 1);
      return <ul>{order.map((id) => <li key={id} id={`item-${id}`}>{id}</li>)}</ul>;
    }

    const root = createRoot();
    mount(root, <List />);
    const existing = root.querySelector('#item-b');

    order = ['a', 'b', 'c'];
    rerender();

    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b', 'c']);
    expect(root.querySelector('#item-b')).toBe(existing);
  });

  it('gives duplicate keys separate hook stores', () => {
    function Item({ label }: { label: string }) {
      const [mountedAs] = useState(() => label);
      return <li>{mountedAs}</li>;
    }

    const root = createRoot();
    mount(
      root,
      <ul>
        <Item key="same" label="first" />
        <Item key="same" label="second" />
      </ul>
    );

    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['first', 'second']);
  });
});

describe('reconciler: structure changes', () => {
  it('replaces a node when the tag changes', () => {
    let toggle: (value: boolean) => void = () => {};

    function App() {
      const [heading, set] = useState(true);
      toggle = set;
      return <div>{heading ? <h1>title</h1> : <h2>title</h2>}</div>;
    }

    const root = createRoot();
    mount(root, <App />);
    expect(root.querySelector('h1')).not.toBeNull();

    toggle(false);

    expect(root.querySelector('h1')).toBeNull();
    expect(root.querySelector('h2')?.textContent).toBe('title');
  });

  it('keeps siblings stable when a conditional child appears', () => {
    let toggle: (value: boolean) => void = () => {};

    function App() {
      const [show, set] = useState(false);
      toggle = set;
      return (
        <div>
          {show ? <em id="extra">extra</em> : null}
          <span id="always">always</span>
        </div>
      );
    }

    const root = createRoot();
    mount(root, <App />);
    const always = root.querySelector('#always');

    toggle(true);

    expect(root.querySelector('#extra')?.textContent).toBe('extra');
    expect(root.querySelector('#always')).toBe(always);
    expect(root.querySelector('div')?.firstElementChild?.id).toBe('extra');
  });

  it('renders svg children in the svg namespace', () => {
    const root = createRoot();
    mount(
      root,
      <svg viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" />
      </svg>
    );

    const circle = root.querySelector('circle')!;
    expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(root.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 10 10');
  });
});
