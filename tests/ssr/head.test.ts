import { describe, expect, it } from 'vitest';

import { applyHtmlLang, renderHead } from '../../src/ssr/head.js';

describe('renderHead', () => {
  it('always emits a title', () => {
    expect(renderHead(undefined, 'Karui')).toContain('<title>Karui</title>');
  });

  it('escapes the title', () => {
    expect(renderHead({}, '<script>x</script>')).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>');
  });

  it('emits description, robots and canonical', () => {
    const head = renderHead(
      { description: 'A tiny framework', robots: 'noindex', canonical: 'https://karui.dev/' },
      'Karui'
    );

    expect(head).toContain('<meta name="description" content="A tiny framework">');
    expect(head).toContain('<meta name="robots" content="noindex">');
    expect(head).toContain('<link rel="canonical" href="https://karui.dev/">');
  });

  it('derives Open Graph defaults from title, description and canonical', () => {
    const head = renderHead({ description: 'Tiny', canonical: 'https://karui.dev/' }, 'Karui');

    expect(head).toContain('<meta property="og:title" content="Karui">');
    expect(head).toContain('<meta property="og:description" content="Tiny">');
    expect(head).toContain('<meta property="og:url" content="https://karui.dev/">');
  });

  it('lets explicit og values override the derived ones', () => {
    const head = renderHead({ og: { title: 'Custom', image: 'https://karui.dev/card.png' } }, 'Karui');

    expect(head).toContain('<meta property="og:title" content="Custom">');
    expect(head).not.toContain('<meta property="og:title" content="Karui">');
    expect(head).toContain('<meta property="og:image" content="https://karui.dev/card.png">');
  });

  it('emits twitter tags under the name attribute', () => {
    const head = renderHead({ twitter: { card: 'summary_large_image' } }, 'Karui');

    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('passes through arbitrary meta and link tags', () => {
    const head = renderHead(
      {
        meta: [{ 'http-equiv': 'refresh', content: '5' }],
        link: [{ rel: 'alternate', hreflang: 'de', href: '/de' }],
      },
      'Karui'
    );

    expect(head).toContain('<meta http-equiv="refresh" content="5">');
    expect(head).toContain('<link rel="alternate" hreflang="de" href="/de">');
  });

  it('escapes attribute values', () => {
    const head = renderHead({ description: 'quote " and <tag>' }, 'Karui');

    expect(head).toContain('content="quote &quot; and &lt;tag&gt;"');
  });

  it('skips null and undefined values', () => {
    const head = renderHead({ og: { image: undefined, type: 'website' } }, 'Karui');

    expect(head).not.toContain('og:image');
    expect(head).toContain('<meta property="og:type" content="website">');
  });
});

describe('applyHtmlLang', () => {
  it('replaces an existing lang attribute', () => {
    expect(applyHtmlLang('<html lang="en"><body></body></html>', 'de'))
      .toBe('<html lang="de"><body></body></html>');
  });

  it('adds lang when the html tag has none', () => {
    expect(applyHtmlLang('<html><body></body></html>', 'fr'))
      .toBe('<html lang="fr"><body></body></html>');
  });

  it('keeps other attributes on the html tag', () => {
    expect(applyHtmlLang('<html lang="en" data-theme="dark">', 'ja'))
      .toBe('<html lang="ja" data-theme="dark">');
  });

  it('leaves the template alone when no lang is set', () => {
    const template = '<html lang="en"><body></body></html>';
    expect(applyHtmlLang(template, undefined)).toBe(template);
  });
});
