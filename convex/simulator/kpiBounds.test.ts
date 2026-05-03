import { jest, describe, test, expect, beforeAll } from '@jest/globals';

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

let clampKpi: any;

beforeAll(async () => {
  const mod = await import('./index') as any;
  clampKpi = mod.clampKpi;
});

describe('clampKpi', () => {

  test('test_returns_value_unchanged_when_within_bounds', () => {
    // anything between -100 and 100 should pass through untouched
    expect(clampKpi(0)).toBe(0);
    expect(clampKpi(50)).toBe(50);
    expect(clampKpi(-50)).toBe(-50);
    expect(clampKpi(99)).toBe(99);
    expect(clampKpi(-99)).toBe(-99);
  });

  test('test_caps_at_positive_100_when_above_upper_bound', () => {
    // anything above 100 should be clamped down to 100
    expect(clampKpi(101)).toBe(100);
    expect(clampKpi(500)).toBe(100);
    expect(clampKpi(999999)).toBe(100);
  });

  test('test_floors_at_negative_100_when_below_lower_bound', () => {
    expect(clampKpi(-101)).toBe(-100);
    expect(clampKpi(-500)).toBe(-100);
    expect(clampKpi(-999999)).toBe(-100);
  });

  // exact boundaries should pass through, not get clamped one off
  test('test_handles_exact_upper_boundary', () => {
    expect(clampKpi(100)).toBe(100);
  });

  test('test_handles_exact_lower_boundary', () => {
    expect(clampKpi(-100)).toBe(-100);
  });

});