import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { fetchWikipediaSummary } from './wikipedia';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('fetchWikipediaSummary', () => {

  test('test_returns_extract_on_happy_path', async () => {
    globalThis.fetch = (jest.fn() as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ query: { search: [{ title: 'Apple Inc.' }] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ extract: 'Apple Inc. is an American multinational technology company.' }) });

    const result = await fetchWikipediaSummary('Apple');

    expect(result).toBe('Apple Inc. is an American multinational technology company.');
  });

  // add " company" to the search to bias away from disambiguation
  // like "Apple" the fruit vs "Apple" company
  test('test_appends_company_suffix_to_search_url', async () => {
    const mock = (jest.fn() as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ query: { search: [{ title: 'Apple Inc.' }] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ extract: 'OK' }) });
    globalThis.fetch = mock;

    await fetchWikipediaSummary('Apple');

    const firstUrl = mock.mock.calls[0][0];
    expect(firstUrl).toContain(encodeURIComponent('Apple company'));
  });

  // no results --> return empty string
  test('test_returns_empty_when_no_search_results', async () => {
    globalThis.fetch = (jest.fn() as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ query: { search: [] } }) });

    const result = await fetchWikipediaSummary('NotARealCompanyXYZ');

    expect(result).toBe('');
  });

  test('test_returns_empty_when_search_response_not_ok', async () => {
    globalThis.fetch = (jest.fn() as any)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const result = await fetchWikipediaSummary('Apple');

    expect(result).toBe('');
  });

  // network error path, the function should just return ''
  test('test_returns_empty_when_fetch_throws', async () => {
    globalThis.fetch = (jest.fn() as any).mockRejectedValueOnce(new Error('ECONNRESET'));

    const result = await fetchWikipediaSummary('Apple');

    expect(result).toBe('');
  });

});