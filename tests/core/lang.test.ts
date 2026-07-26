import { describe, expect, it, vi } from 'vitest';

import { HttpClient } from '../../src/core/http.js';
import { LanguageService } from '../../src/core/lang.js';

describe('LanguageService', () => {
  it('parses variables from packet', () => {
    const lang = new LanguageService(new HttpClient());
    const parsed = lang.parse('{"title":"+APP+"}', { APP: 'Karui' });

    expect(parsed).toBe('{"title":"Karui"}');
  });


  it('returns key and warns when translation is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lang = new LanguageService(new HttpClient());

    expect(lang.from('MISSING_KEY')).toBe('MISSING_KEY');
    expect(warnSpy).toHaveBeenCalledWith('lang> MISSING_KEY is undefined');
  });
});
