import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

const mockChatCompletion = jest.fn() as any;

jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

// stub Convex factories so importing index.ts doesn't try to register real actions
jest.unstable_mockModule('../_generated/server', () => ({
  action: (config: any) => config,
  query: (config: any) => config,
  mutation: (config: any) => config,
  internalAction: (config: any) => config,
  internalMutation: (config: any) => config,
  internalQuery: (config: any) => config,
}));

jest.unstable_mockModule('../_generated/api', () => ({
  internal: {
    simulator: {
      index: {},
      assessorAgent: {},
      agentWorldContext: {},
    },
  },
}));

jest.unstable_mockModule('../aiTown/insertInput', () => ({
  insertInput: jest.fn(),
}));

// minimum viable convex/values mock so the import chain can load
// had to add ConvexError + a few helpers after hitting "no such export" errors
jest.unstable_mockModule('convex/values', () => {
  class ConvexError extends Error {
    data: any;
    constructor(data: any) {
      super(typeof data === 'string' ? data : JSON.stringify(data));
      this.data = data;
    }
  }
  return {
    __esModule: true,
    v: {
      string: () => 'string',
      number: () => 'number',
      boolean: () => 'boolean',
      id: (_: string) => 'id',
      optional: (x: any) => x,
      array: (x: any) => x,
      object: (x: any) => x,
      union: (...x: any[]) => x,
      literal: (x: any) => x,
      any: () => 'any',
      null: () => 'null',
      bytes: () => 'bytes',
      int64: () => 'int64',
    },
    convexToJson: (x: any) => x,
    jsonToConvex: (x: any) => x,
    ConvexError,
    isValidator: (_: any) => true,
    parseArgs: (x: any) => x,
  };
});

let generateScenarioQuestions: any;

beforeAll(async () => {
  const mod = await import('./index') as any;
  generateScenarioQuestions = mod.generateScenarioQuestions;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('generateScenarioQuestions', () => {

  test('test_returns_questions_array_of_correct_count', async () => {
    const questions = JSON.stringify([
      { id: 'q1', scenario: 'What should Apple do?', options: [{ label: 'A', text: 'Buy' }, { label: 'B', text: 'Sell' }] },
      { id: 'q2', scenario: 'Should they expand?', options: [{ label: 'A', text: 'Yes' }, { label: 'B', text: 'No' }] },
      { id: 'q3', scenario: 'Hire engineers?', options: [{ label: 'A', text: 'Yes' }, { label: 'B', text: 'No' }] },
    ]);
    mockChatCompletion.mockResolvedValueOnce({ content: questions });

    const result = await generateScenarioQuestions('Apple acquires Anthropic.', 'medium', 3);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('q1');
    expect(result[0].options).toHaveLength(2);
  });

  // "hard" difficulty should put strategic analysis wording into the system prompt
  test('test_passes_difficulty_into_system_prompt', async () => {
    const questions = JSON.stringify([
      { id: 'q1', scenario: 'Strategic question', options: [{ label: 'A', text: 'X' }, { label: 'B', text: 'Y' }] },
    ]);
    mockChatCompletion.mockResolvedValueOnce({ content: questions });

    await generateScenarioQuestions('Apple acquires Anthropic.', 'hard', 1);

    const callArgs = mockChatCompletion.mock.calls[0][0];
    const systemMsg = callArgs.messages.find((m: any) => m.role === 'system').content;
    expect(systemMsg).toMatch(/strategic analysis/i);
  });

  // when we pass agentContext, the user prompt should include it so questions are grounded
  test('test_includes_agent_context_when_provided', async () => {
    const questions = JSON.stringify([
      { id: 'q1', scenario: 'Q', options: [{ label: 'A', text: 'X' }, { label: 'B', text: 'Y' }] },
    ]);
    mockChatCompletion.mockResolvedValueOnce({ content: questions });

    await generateScenarioQuestions('Apple news.', 'easy', 1, 'Apple is feeling pressured by AI rivals.');

    const callArgs = mockChatCompletion.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: any) => m.role === 'user').content;
    expect(userMsg).toContain('Agent context');
    expect(userMsg).toContain('Apple is feeling pressured');
  });

  // without agentContext the user prompt should not mention agent context
  test('test_omits_agent_context_when_not_provided', async () => {
    const questions = JSON.stringify([
      { id: 'q1', scenario: 'Q', options: [{ label: 'A', text: 'X' }, { label: 'B', text: 'Y' }] },
    ]);
    mockChatCompletion.mockResolvedValueOnce({ content: questions });

    await generateScenarioQuestions('Apple news.', 'easy', 1);

    const callArgs = mockChatCompletion.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: any) => m.role === 'user').content;
    expect(userMsg).not.toContain('Agent context');
  });

  // first call malformed, second valid, retry should kick in
  test('test_retries_on_malformed_then_succeeds', async () => {
    const questions = JSON.stringify([
      { id: 'q1', scenario: 'Q', options: [{ label: 'A', text: 'X' }, { label: 'B', text: 'Y' }] },
    ]);
    mockChatCompletion.mockResolvedValueOnce({ content: 'not json at all' });
    mockChatCompletion.mockResolvedValueOnce({ content: questions });

    const result = await generateScenarioQuestions('Apple news.', 'easy', 1);

    expect(result).toHaveLength(1);
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  test('test_throws_after_three_failed_attempts', async () => {
    mockChatCompletion.mockResolvedValue({ content: 'not json' });

    await expect(generateScenarioQuestions('Apple news.', 'easy', 1)).rejects.toThrow();
    expect(mockChatCompletion).toHaveBeenCalledTimes(3);
  });

});