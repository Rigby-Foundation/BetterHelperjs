import type { CounterRenderState } from '../core/state.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import {
  createCounterSite,
  type CounterSite,
  type CounterSiteConfig,
  type CounterSiteHydrationMode,
  type CounterSiteState,
  type FileSystemModule,
} from './counter-site.js';
import type { ShellRenderProps } from './runtime.js';

export type CounterSiteLayoutProps = ShellRenderProps<CounterRenderState>;
export type CounterSiteLayout = (props: CounterSiteLayoutProps) => VNodeChild;

export interface CounterLayoutSiteConfig extends Omit<CounterSiteConfig, 'pages' | 'shell'> {
  pages: Record<string, FileSystemModule<CounterSiteState>>;
  layout: CounterSiteLayout;
  hydrateMode?: CounterSiteHydrationMode;
  /** @deprecated Use `hydrateMode` instead. Will be removed in 3.2.0. */
  autoHydrate?: boolean;
}

function resolveHydrationMode(config: CounterLayoutSiteConfig): CounterSiteHydrationMode {
  if (config.hydrateMode) {
    return config.hydrateMode;
  }

  if (config.autoHydrate === false) {
    return 'none';
  }

  return 'full';
}

export function createCounterLayoutSite(config: CounterLayoutSiteConfig): CounterSite {
  const { layout, autoHydrate = true, ...rest } = config;
  const hydrateMode = resolveHydrationMode(config);

  const site = createCounterSite({
    ...rest,
    shell: layout,
    hydrateMode,
  });

  if (autoHydrate && hydrateMode !== 'none' && typeof window !== 'undefined') {
    site.hydrate();
  }

  return site;
}

export const defineCounterSite = createCounterLayoutSite;
