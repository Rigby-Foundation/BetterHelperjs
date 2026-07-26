/**
 * Karui's main entry: the JSX runtime, the router, and SSR.
 *
 * This module has no side effects — importing it registers nothing and
 * instantiates nothing, so bundlers drop whatever your app does not use.
 *
 * The inherited `newHelper-js` toolkit (`helper`, `_`, `WindowManager`,
 * `Hotkeys`, `LazyLoader`, `LinkManager`, `LanguageService`, `HttpClient`)
 * moved to `@rigbyhost/karui/legacy` in 5.0.
 */
export * from './core/runtime.js';
export * from './core/state.js';
export * from './jsx/index.js';
export * from './router/index.js';
export * from './router/file-based.js';
export * from './ssr/index.js';
