import { describe, expect, it } from 'vitest';

import { createRouteRequest, notFound, redirect } from '../../src/router/index.js';
import {
  createSite,
  type SiteActionContext,
  type SiteRouteContext,
} from '../../src/ssr/site.js';

function formPost(body: string) {
  return createRouteRequest('POST', { 'content-type': 'application/x-www-form-urlencoded' }, body);
}

function jsonPost(body: unknown) {
  return createRouteRequest('POST', { 'content-type': 'application/json' }, JSON.stringify(body));
}

interface SitePages {
  action?: (ctx: SiteActionContext) => unknown;
  loader?: (ctx: SiteRouteContext) => unknown;
}

function makeSite({ action, loader }: SitePages) {
  return createSite({
    pages: {
      './pages/contact.tsx': {
        meta: { title: 'Contact' },
        action,
        loader,
        default: (ctx: SiteRouteContext) => {
          const result = ctx.actionData as { message?: string; error?: string } | undefined;
          return (
            <section>
              <p>action:{result?.message ?? result?.error ?? 'none'}</p>
              <p>loader:{String((ctx.data as { hits?: number } | undefined)?.hits ?? '-')}</p>
            </section>
          );
        },
      },
      './pages/404.tsx': { default: () => <p>nf</p> },
    },
    shell: ({ children }) => <main>{children}</main>,
    pagesRoot: './pages',
    notFoundFile: './pages/404.tsx',
    defaultTitle: 'Untitled',
  });
}

describe('route actions', () => {
  it('runs the action and exposes actionData to the page', async () => {
    const site = makeSite({
      action: (ctx) => ({ message: `got:${String(ctx.request.formData.name)}` }),
    });

    const rendered = await site.render('/contact', formPost('name=ada'));

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('action:got:ada');
  });

  it('re-runs the loader after the action so the page shows fresh data', async () => {
    let hits = 0;
    const site = makeSite({
      action: () => ({ message: 'ok' }),
      loader: () => {
        hits += 1;
        return { hits };
      },
    });

    const rendered = await site.render('/contact', formPost('name=ada'));

    expect(rendered.html).toContain('action:ok');
    expect(rendered.html).toContain('loader:1');
  });

  it('parses a JSON body into formData and json', async () => {
    const site = makeSite({
      action: (ctx) => ({
        message: `${String(ctx.request.formData.name)}/${String((ctx.request.json as { age?: number }).age)}`,
      }),
    });

    const rendered = await site.render('/contact', jsonPost({ name: 'ada', age: 36 }));

    expect(rendered.html).toContain('action:ada/36');
  });

  it('collects repeated form fields into an array', async () => {
    const site = makeSite({
      action: (ctx) => ({ message: (ctx.request.formData.tag as string[]).join('+') }),
    });

    const rendered = await site.render('/contact', formPost('tag=a&tag=b&tag=c'));

    expect(rendered.html).toContain('action:a+b+c');
  });

  it('turns an action redirect into a redirect result, not HTML', async () => {
    const site = makeSite({
      action: () => {
        redirect('/contact?sent=1', 303);
      },
    });

    const rendered = await site.render('/contact', formPost('name=ada'));

    expect(rendered.redirect).toEqual({ location: '/contact?sent=1', status: 303 });
    expect(rendered.status).toBe(303);
    expect(rendered.html).toBe('');
  });

  it('renders the not-found page when an action calls notFound()', async () => {
    const site = makeSite({
      action: () => {
        notFound();
      },
    });

    const rendered = await site.render('/contact', formPost(''));

    expect(rendered.status).toBe(404);
    expect(rendered.html).toContain('nf');
  });

  it('answers 405 when the route exports no action', async () => {
    const site = makeSite({});

    const rendered = await site.render('/contact', formPost('name=ada'));

    expect(rendered.status).toBe(405);
    expect(rendered.html).toContain('action:none');
  });

  it('leaves plain GET renders untouched', async () => {
    let actionRuns = 0;
    const site = makeSite({
      action: () => {
        actionRuns += 1;
        return { message: 'ran' };
      },
    });

    const rendered = await site.render('/contact');

    expect(actionRuns).toBe(0);
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('action:none');
  });
});

describe('loader redirects', () => {
  it('surfaces a loader redirect as a redirect result', async () => {
    const site = makeSite({
      loader: () => {
        redirect('/login');
      },
    });

    const rendered = await site.render('/contact');

    expect(rendered.redirect).toEqual({ location: '/login', status: 302 });
    expect(rendered.status).toBe(302);
  });

  it('honours a custom redirect status', async () => {
    const site = makeSite({
      loader: () => {
        redirect('/moved', 301);
      },
    });

    const rendered = await site.render('/contact');

    expect(rendered.redirect?.status).toBe(301);
  });
});
