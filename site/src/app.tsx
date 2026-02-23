import { defineCounterSite, type CounterSiteState, type FileSystemModule } from 'better-helperjs/ssr';
import Layout from './layout.js';

const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<string, FileSystemModule<CounterSiteState>>;

export const site = defineCounterSite({
  pages,
  layout: Layout,
  titlePrefix: 'Test Site',
  defaultTitle: 'Untitled',
  pagesRoot: './pages',
  notFoundFile: './pages/404.tsx',
  stateKey: '__SITE_STATE__',
  autoHydrate: true,
});
