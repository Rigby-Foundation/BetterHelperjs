/**
 * Names from before the counter demo was untangled from the framework.
 *
 * The old API hardcoded a `count` field into every site's state because the
 * reference app was a counter. Site state is now user-defined; these aliases
 * keep 4.x code compiling and are removed in 6.0.
 */
import { createCounterRenderState, type CounterRenderState } from '../core/state.js';
import type { FileSystemModule } from '../router/file-based.js';
import {
  createLayoutSite,
  createSite,
  type HydrationMode,
  type LayoutSiteConfig,
  type Site,
  type SiteActionContext,
  type SiteConfig,
  type SiteErrorContext,
  type SiteLayout,
  type SiteLayoutProps,
  type SiteRenderResult,
  type SiteRouteContext,
} from './site.js';

/** @deprecated Renamed to {@link HydrationMode}. Removed in 6.0. */
export type CounterSiteHydrationMode = HydrationMode;

/** @deprecated Use your own state type extending `RenderState`. Removed in 6.0. */
export type CounterSiteState = CounterRenderState;

/** @deprecated Renamed to {@link SiteRouteContext}. Removed in 6.0. */
export type CounterSiteRouteContext = SiteRouteContext<CounterRenderState>;

/** @deprecated Renamed to {@link SiteActionContext}. Removed in 6.0. */
export type CounterSiteActionContext = SiteActionContext<CounterRenderState>;

/** @deprecated Renamed to {@link SiteErrorContext}. Removed in 6.0. */
export type CounterSiteErrorContext = SiteErrorContext<CounterRenderState>;

/** @deprecated Renamed to {@link SiteLayoutProps}. Removed in 6.0. */
export type CounterSiteLayoutProps = SiteLayoutProps<CounterRenderState>;

/** @deprecated Renamed to {@link SiteLayout}. Removed in 6.0. */
export type CounterSiteLayout = SiteLayout<CounterRenderState>;

/** @deprecated Renamed to {@link Site}. Removed in 6.0. */
export type CounterSite = Site<CounterRenderState>;

/** @deprecated Renamed to {@link SiteRenderResult}. Removed in 6.0. */
export type CounterSiteRenderResult = SiteRenderResult<CounterRenderState>;

/** @deprecated Renamed to {@link SiteConfig}. Removed in 6.0. */
export interface CounterSiteConfig extends Omit<SiteConfig<CounterRenderState>, 'pages'> {
  pages: Record<string, FileSystemModule<CounterRenderState>>;
}

/** @deprecated Renamed to {@link LayoutSiteConfig}. Removed in 6.0. */
export interface CounterLayoutSiteConfig extends Omit<LayoutSiteConfig<CounterRenderState>, 'pages'> {
  pages: Record<string, FileSystemModule<CounterRenderState>>;
}

// The old default state carried `count: 0`; preserve it for these entry points.
const withCounterState = <T extends { createState?: (url: string, runtime: string) => CounterRenderState }>(
  config: T
): T => ({
  ...config,
  createState: config.createState ?? ((url, runtime) => createCounterRenderState(url, runtime)),
});

/** @deprecated Renamed to {@link createSite}. Removed in 6.0. */
export function createCounterSite(config: CounterSiteConfig): CounterSite {
  return createSite<CounterRenderState>(withCounterState(config));
}

/** @deprecated Renamed to {@link createLayoutSite}. Removed in 6.0. */
export function createCounterLayoutSite(config: CounterLayoutSiteConfig): CounterSite {
  return createLayoutSite<CounterRenderState>(withCounterState(config));
}

/** @deprecated Renamed to {@link defineSite}. Removed in 6.0. */
export const defineCounterSite = createCounterLayoutSite;
