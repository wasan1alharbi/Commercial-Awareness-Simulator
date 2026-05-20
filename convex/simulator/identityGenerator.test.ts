import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

const mockChatCompletion = jest.fn() as any;

jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

let generateIdentityPrompt: any;

beforeAll(async () => {
  const mod = await import('./gateAgent');
  generateIdentityPrompt = mod.generateIdentityPrompt;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('generateIdentityPrompt', () => {

  test('test_returns_well_formed_identity', async () => {
    const identity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Microsoft'],
      goals: ['Maintain hardware margins', 'Expand AI capabilities'],
      motivation: 'Defend ecosystem leadership against AI-native rivals',
      personality: 'Cautious, design-led, secretive',
      articleRelevance: 'This news affects Apple because Anthropic builds rival models.',
      country: 'United States',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });

    const result = await generateIdentityPrompt(
      'Apple',
      'Apple Inc. is a multinational tech company.',
      'Apple acquires Anthropic in landmark AI deal.'
    );

    expect(result.industry).toBe('Consumer electronics');
    expect(result.products).toHaveLength(3);
    expect(result.competitors).toHaveLength(3);
    expect(result.goals).toHaveLength(2);
    expect(result.articleRelevance).toContain('Apple');
  });

  // baseline: when the LLM behaves, company shouldn't be in its own competitors
  test('test_baseline_no_self_in_competitors', async () => {
    const identity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Microsoft'],
      goals: ['Maintain margins', 'Expand AI'],
      motivation: 'Defend ecosystem',
      personality: 'Cautious',
      articleRelevance: 'This news affects Apple.',
      country: 'United States',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });

    const result = await generateIdentityPrompt('Apple', 'Apple is a tech company', 'Apple news');

    expect(result.competitors).not.toContain('Apple');
  });

  // surfacing test: documents that we don't filter self-competitor
  test('test_unfiltered_self_competitor_known_limit', async () => {
    const badIdentity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Apple', 'Samsung', 'Google'],
      goals: ['Maintain margins', 'Expand AI'],
      motivation: 'Defend ecosystem',
      personality: 'Cautious',
      articleRelevance: 'This news affects Apple.',
      country: 'United States',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: badIdentity });

    const result = await generateIdentityPrompt('Apple', 'Apple is a tech company', 'Apple news');

    // if this passes, it confirms the implementation does not filter self
    expect(result.competitors).toContain('Apple');
  });

  test('test_handles_empty_wikipedia_extract', async () => {
    const identity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Microsoft'],
      goals: ['Maintain margins', 'Expand AI'],
      motivation: 'Defend ecosystem',
      personality: 'Cautious',
      articleRelevance: 'This news affects Apple.',
      country: 'United States',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });

    const result = await generateIdentityPrompt('Apple', '', 'Apple acquires Anthropic.');

    expect(result.industry).toBe('Consumer electronics');
    expect(result.products).toHaveLength(3);
  });

  test('test_locks_full_eight_field_schema', async () => {
    const identity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Microsoft'],
      goals: ['Maintain margins', 'Expand AI'],
      motivation: 'Defend ecosystem',
      personality: 'Cautious, design-led, secretive',
      articleRelevance: 'This news affects Apple.',
      country: 'United States',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });

    const result = await generateIdentityPrompt('Apple', 'Apple Inc.', 'Apple news');

    // all 8 fields must be present with the right primitive shape
    expect(typeof result.industry).toBe('string');
    expect(Array.isArray(result.products)).toBe(true);
    expect(result.products).toHaveLength(3);
    expect(Array.isArray(result.competitors)).toBe(true);
    expect(result.competitors).toHaveLength(3);
    expect(Array.isArray(result.goals)).toBe(true);
    expect(result.goals).toHaveLength(2);
    expect(typeof result.motivation).toBe('string');
    expect(typeof result.personality).toBe('string');
    expect(typeof result.articleRelevance).toBe('string');
    expect(typeof result.country).toBe('string');
    // no extra keys
    expect(Object.keys(result).sort()).toEqual([
      'articleRelevance', 'competitors', 'country', 'goals',
      'industry', 'motivation', 'personality', 'products',
    ]);
  });

  // run it 20 times, should be identical each time
  test('test_t0_reproducibility_20_calls', async () => {
    const identity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Microsoft'],
      goals: ['Maintain margins', 'Expand AI'],
      motivation: 'Defend ecosystem',
      personality: 'Cautious',
      articleRelevance: 'This news affects Apple.',
      country: 'United States',
    });
    
    mockChatCompletion.mockResolvedValue({ content: identity });

    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await generateIdentityPrompt('Apple', 'Apple Inc.', 'Apple news');
      results.push(JSON.stringify(r));
    }

   
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
    expect(mockChatCompletion).toHaveBeenCalledTimes(20);
    
    // also check we actually pass temp 0
    const calls = mockChatCompletion.mock.calls;
    for (const call of calls) {
      expect(call[0].temperature).toBe(0);
    }
  });

  test('test_retry_succeeds_on_third_attempt', async () => {
    const goodIdentity = JSON.stringify({
      industry: 'Consumer electronics',
      products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Microsoft'],
      goals: ['Maintain margins', 'Expand AI'],
      motivation: 'Defend ecosystem',
      personality: 'Cautious',
      articleRelevance: 'This news affects Apple.',
      country: 'United States',
    });
    // bad, bad, good
    mockChatCompletion
      .mockResolvedValueOnce({ content: 'not json' })
      .mockResolvedValueOnce({ content: '{ broken' })
      .mockResolvedValueOnce({ content: goodIdentity });

    const result = await generateIdentityPrompt('Apple', 'Apple Inc.', 'Apple news');

    expect(result.industry).toBe('Consumer electronics');
    expect(mockChatCompletion).toHaveBeenCalledTimes(3);
  });

  // 3 bad in a row, should throw
  test('test_retry_throws_after_three_malformed', async () => {
    mockChatCompletion
      .mockResolvedValueOnce({ content: 'not json' })
      .mockResolvedValueOnce({ content: '{ still broken' })
      .mockResolvedValueOnce({ content: 'still nope' });

    await expect(
      generateIdentityPrompt('Apple', 'Apple Inc.', 'Apple news'),
    ).rejects.toThrow();

    expect(mockChatCompletion).toHaveBeenCalledTimes(3);
  });

});