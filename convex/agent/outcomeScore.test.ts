import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// UT-OS-01: tests the outcome score helper used for Chapter 7 evaluation

const mockChatCompletion = jest.fn() as any;

jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

let scoreStatementOutcome: any;

beforeAll(async () => {
  const mod = await import('./outcomeScore');
  scoreStatementOutcome = mod.scoreStatementOutcome;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('scoreStatementOutcome', () => {
  test('test_returns_a_number_between_0_and_10', async () => {
    // normal case: critic says 8
    mockChatCompletion.mockResolvedValueOnce({ content: '8' });
    const score = await scoreStatementOutcome('We launched a new iPhone', {
      name: 'Apple',
      industry: 'Tech',
      products: ['iPhone'],
    });
    expect(score).toBe(8);

    // if the LLM gives a number too big it should clamp to 10
    mockChatCompletion.mockResolvedValueOnce({ content: '15' });
    expect(await scoreStatementOutcome('some statement', {})).toBe(10);

    // if the LLM gives back text instead of a number, return 0
    mockChatCompletion.mockResolvedValueOnce({ content: 'not a number' });
    expect(await scoreStatementOutcome('some statement', {})).toBe(0);
  });
});
