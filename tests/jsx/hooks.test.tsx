// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createContext, mount, useContext, useEffect, useMemo, useReducer, useState } from '../../src/jsx/index.js';

describe('jsx hooks', () => {
  it('keeps state between rerenders and updates dom', () => {
    function Counter() {
      const [count, setCount] = useState(0);

      return (
        <button
          id="counter"
          onClick={() => setCount((value) => value + 1)}
        >
          count:{count}
        </button>
      );
    }

    const root = document.createElement('div');
    document.body.append(root);

    mount(root, <Counter />);
    const button = root.querySelector<HTMLButtonElement>('#counter');
    button?.click();
    button?.click();

    expect(root.textContent).toContain('count:2');
  });

  it('runs effect and memoizes computed values', () => {
    let effectRuns = 0;
    let computations = 0;

    function Demo() {
      const [value, setValue] = useState(1);
      const doubled = useMemo(() => {
        computations += 1;
        return value * 2;
      }, [value]);

      useEffect(() => {
        effectRuns += 1;
      }, [value]);

      return (
        <button id="demo" onClick={() => setValue((current) => current + 1)}>
          doubled:{doubled}
        </button>
      );
    }

    const root = document.createElement('div');
    document.body.append(root);

    mount(root, <Demo />);
    const button = root.querySelector<HTMLButtonElement>('#demo');
    button?.click();

    expect(root.textContent).toContain('doubled:4');
    expect(effectRuns).toBe(2);
    expect(computations).toBe(2);
  });

  it('updates reducer state via dispatch', () => {
    type Action = 'inc' | 'dec';

    function Counter() {
      const [count, dispatch] = useReducer<number, Action>((state, action) => {
        if (action === 'inc') return state + 1;
        return state - 1;
      }, 0);

      return (
        <div>
          <button id="inc" onClick={() => dispatch('inc')}>inc</button>
          <button id="dec" onClick={() => dispatch('dec')}>dec</button>
          <span id="value">{count}</span>
        </div>
      );
    }

    const root = document.createElement('div');
    document.body.append(root);

    mount(root, <Counter />);
    root.querySelector<HTMLButtonElement>('#inc')?.click();
    root.querySelector<HTMLButtonElement>('#inc')?.click();
    root.querySelector<HTMLButtonElement>('#dec')?.click();

    expect(root.querySelector('#value')?.textContent).toBe('1');
  });

  it('provides context values to nested components', () => {
    const ThemeContext = createContext('light');

    function ThemeValue() {
      const theme = useContext(ThemeContext);
      return <span id="theme">{theme}</span>;
    }

    function App() {
      const [theme, setTheme] = useState('light');

      return (
        <ThemeContext.Provider value={theme}>
          <button id="toggle" onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}>
            toggle
          </button>
          <ThemeValue />
        </ThemeContext.Provider>
      );
    }

    const root = document.createElement('div');
    document.body.append(root);

    mount(root, <App />);
    expect(root.querySelector('#theme')?.textContent).toBe('light');

    root.querySelector<HTMLButtonElement>('#toggle')?.click();
    expect(root.querySelector('#theme')?.textContent).toBe('dark');
  });
});
