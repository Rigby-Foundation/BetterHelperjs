import type { CounterRenderState } from '../core/state.js';
import type { VNodeChild } from '../jsx/jsx-runtime.js';
import { createCounterSite, type CounterSite, type CounterSiteConfig, type CounterSiteState, type FileSystemModule } from './counter-site.js';
import type { ShellRenderProps } from './runtime.js';

export type CounterSiteLayoutProps = ShellRenderProps<CounterRenderState>;
export type CounterSiteLayout = (props: CounterSiteLayoutProps) => VNodeChild;

export interface CounterLayoutSiteConfig extends Omit<CounterSiteConfig, 'pages' | 'shell'> {
  pages: Record<string, FileSystemModule<CounterSiteState>>;
  layout: CounterSiteLayout;
  autoHydrate?: boolean;
}

export function createCounterLayoutSite(config: CounterLayoutSiteConfig): CounterSite {
  const { layout, autoHydrate = true, ...rest } = config;

  const site = createCounterSite({
    ...rest,
    shell: layout,
  });

  if (autoHydrate && typeof window !== 'undefined') {
    site.hydrate();
  }

  return site;
}

export const defineCounterSite = createCounterLayoutSite;
