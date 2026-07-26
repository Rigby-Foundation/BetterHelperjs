import { defineSite, type RenderState, type FileSystemModule } from '@rigbyhost/karui/ssr';
import Layout from './layout.js';

const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<string, FileSystemModule<RenderState>>;

export const site = defineSite({
  pages,
  layout: Layout,
  titlePrefix: 'Test Site',
  defaultTitle: 'Untitled',
  pagesRoot: './pages',
  notFoundFile: './pages/404.tsx',
  stateKey: '__SITE_STATE__',
});
