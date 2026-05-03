import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

const mockChatCompletion = jest.fn() as any;

jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

let gateAgentPrompt: any;

beforeAll(async () => {
  const mod = await import('./gateAgent');
  gateAgentPrompt = mod.gateAgentPrompt;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('gateAgentPrompt', () => {

  test('test_parses_well_formed_response', async () => {
    const goodResponse = JSON.stringify({
      isValid: true,
      rejectionReason: null,
      companies: ['Apple', 'Anthropic'],
      summary: 'Apple acquires Anthropic in landmark AI deal.',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: goodResponse });

    const result = await gateAgentPrompt('Apple acquires Anthropic for $50bn...');

    expect(result.isValid).toBe(true);
    expect(result.companies).toEqual(['Apple', 'Anthropic']);
    expect(result.summary).toContain('Apple');
    expect(mockChatCompletion).toHaveBeenCalledTimes(1);
  });

  // sometimes the LLM wraps its output in ```json``` so we need to strip it
  test('test_strips_fenced_json', async () => {
    const goodResponse = JSON.stringify({
      isValid: true,
      rejectionReason: null,
      companies: ['Apple', 'Anthropic'],
      summary: 'Apple acquires Anthropic in landmark AI deal.',
    });
    const fenced = '```json\n' + goodResponse + '\n```';
    mockChatCompletion.mockResolvedValueOnce({ content: fenced });

    const result = await gateAgentPrompt('Apple acquires Anthropic for $50bn...');

    expect(result.isValid).toBe(true);
    expect(result.companies).toEqual(['Apple', 'Anthropic']);
  });

  // first call fails, second one works, testing the retry
  test('test_retries_on_malformed_then_succeeds', async () => {
    const goodResponse = JSON.stringify({
      isValid: true,
      rejectionReason: null,
      companies: ['Apple', 'Anthropic'],
      summary: 'Apple acquires Anthropic in landmark AI deal.',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: 'not json at all' });
    mockChatCompletion.mockResolvedValueOnce({ content: goodResponse });

    const result = await gateAgentPrompt('Apple acquires Anthropic for $50bn...');

    expect(result.isValid).toBe(true);
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  test('test_throws_after_three_failed_attempts', async () => {
    mockChatCompletion.mockResolvedValue({ content: 'not json' });

    await expect(gateAgentPrompt('Apple acquires Anthropic for $50bn...')).rejects.toThrow();
    expect(mockChatCompletion).toHaveBeenCalledTimes(3);
  });

  test('test_uses_temperature_zero_for_determinism', async () => {
    const goodResponse = JSON.stringify({
      isValid: true,
      rejectionReason: null,
      companies: ['Apple'],
      summary: 'Apple announces new iPhone.',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: goodResponse });

    await gateAgentPrompt('Apple announces new iPhone...');

    const callArgs = mockChatCompletion.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

});