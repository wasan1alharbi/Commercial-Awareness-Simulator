import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

const mockChatCompletion = jest.fn() as any;

jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

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

let evaluateImpact: any;

beforeAll(async () => {
  const mod = await import('./index');
  evaluateImpact = mod.evaluateImpact;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('evaluateImpact', () => {

  const baselineKPIs = { profit: 0, marketShare: 0, liquidity: 0, trust: 0, compliance: 0 };

  test('test_returns_kpi_deltas_with_all_five_fields', async () => {
    const validDeltas = JSON.stringify({
      profit: 10, marketShare: -5, liquidity: 0, trust: 15, compliance: -10,
    });
    mockChatCompletion.mockResolvedValueOnce({ content: validDeltas });

    const result = await evaluateImpact(
      'Should Apple acquire Anthropic?',
      'Yes, acquire for $50bn',
      baselineKPIs,
    );

    expect(result.profit).toBe(10);
    expect(result.marketShare).toBe(-5);
    expect(result.liquidity).toBe(0);
    expect(result.trust).toBe(15);
    expect(result.compliance).toBe(-10);
  });

  // if the LLM forgets a KPI field the function should throw, not return junk
  test('test_throws_when_kpi_field_is_missing', async () => {
    const incomplete = JSON.stringify({
      profit: 10, marketShare: -5, liquidity: 0, trust: 15,
      // compliance missing
    });
    mockChatCompletion.mockResolvedValue({ content: incomplete });

    await expect(
      evaluateImpact('scenario', 'choice', baselineKPIs),
    ).rejects.toThrow();
  });

  // current KPI state should be in the user prompt so the LLM can reason about it
  test('test_includes_current_kpis_in_user_prompt', async () => {
    const validDeltas = JSON.stringify({
      profit: 0, marketShare: 0, liquidity: 0, trust: 0, compliance: 0,
    });
    mockChatCompletion.mockResolvedValueOnce({ content: validDeltas });

    const currentKPIs = { profit: 50, marketShare: -20, liquidity: 80, trust: 30, compliance: -10 };
    await evaluateImpact('scenario', 'choice', currentKPIs);

    const userMsg = mockChatCompletion.mock.calls[0][0].messages.find((m: any) => m.role === 'user').content;
    expect(userMsg).toContain('profit=50');
    expect(userMsg).toContain('marketShare=-20');
    expect(userMsg).toContain('compliance=-10');
  });

  test('test_retries_on_malformed_then_succeeds', async () => {
    const validDeltas = JSON.stringify({
      profit: 5, marketShare: 0, liquidity: 0, trust: 0, compliance: 0,
    });
    mockChatCompletion.mockResolvedValueOnce({ content: 'not json' });
    mockChatCompletion.mockResolvedValueOnce({ content: validDeltas });

    const result = await evaluateImpact('scenario', 'choice', baselineKPIs);

    expect(result.profit).toBe(5);
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  test('test_throws_after_three_failed_attempts', async () => {
    mockChatCompletion.mockResolvedValue({ content: 'not json' });

    await expect(evaluateImpact('scenario', 'choice', baselineKPIs)).rejects.toThrow();
    expect(mockChatCompletion).toHaveBeenCalledTimes(3);
  });

  // surfacing test: the [-30, +30] bound is only in the prompt, not enforced in code.
  test('test_does_not_clamp_out_of_range_deltas', async () => {
    const oversized = JSON.stringify({
      profit: 999, marketShare: -500, liquidity: 0, trust: 0, compliance: 0,
    });
    mockChatCompletion.mockResolvedValueOnce({ content: oversized });

    const result = await evaluateImpact('scenario', 'choice', baselineKPIs);

    // confirms the function returns whatever the LLM gave, no clamping at this layer
    expect(result.profit).toBe(999);
    expect(result.marketShare).toBe(-500);
  });

});