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

});