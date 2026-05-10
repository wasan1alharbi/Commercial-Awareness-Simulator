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

let cosineSimilarityOfWordBags: any;
let isSameArticleForDuplicateCheck: any;

beforeAll(async () => {
  const mod = await import('./index');
  cosineSimilarityOfWordBags = mod.cosineSimilarityOfWordBags;
  isSameArticleForDuplicateCheck = mod.isSameArticleForDuplicateCheck;
});

describe('isSameArticleForDuplicateCheck', () => {

  // identical text takes the byte equal short circuit at the top of the function
  test('test_identical_articles_are_duplicates', () => {
    const article = 'Apple acquires Anthropic in landmark AI deal worth fifty billion across global markets and infrastructure today.';
    expect(isSameArticleForDuplicateCheck(article, article)).toBe(true);
  });

  test('test_completely_different_long_articles_are_not_duplicates', () => {
    const a = 'Apple acquires Anthropic in landmark AI deal worth fifty billion across global markets and infrastructure today.';
    const b = 'Toyota recalls two hundred thousand vehicles in Japan after brake software defect discovered in monthly safety audit reports yesterday.';
    expect(isSameArticleForDuplicateCheck(a, b)).toBe(false);
  });

  // anything under 15 words bypasses cosine and returns false
  // (otherwise tiny snippets would falsely match each other)
  test('test_short_different_articles_are_not_duplicates', () => {
    const a = 'Apple buys company today';
    const b = 'Apple acquires firm now';
    expect(isSameArticleForDuplicateCheck(a, b)).toBe(false);
  });

  // 16 word article with one word swapped. cosine = 15/16 ≈ 0.94
  // just above the 0.92 cutoff = considered a duplicate
  test('test_near_duplicate_long_articles_are_duplicates', () => {
    const a = 'Apple acquires Anthropic in landmark deal worth fifty billion dollars across global markets and infrastructure today';
    const b = 'Apple acquires Anthropic in landmark deal worth fifty billion pounds across global markets and infrastructure today';
    expect(isSameArticleForDuplicateCheck(a, b)).toBe(true);
  });

  // three words swapped, cosine ~0.81, below the 0.92 cutoff
  test('test_long_articles_with_partial_overlap_are_not_duplicates', () => {
    const a = 'Apple acquires Anthropic in landmark deal worth fifty billion dollars across global markets and infrastructure today';
    const b = 'Apple acquires Anthropic in landmark deal worth fifty billion pounds across regional markets and infrastructure tomorrow';
    expect(isSameArticleForDuplicateCheck(a, b)).toBe(false);
  });

});

describe('cosineSimilarityOfWordBags', () => {

  test('test_cosine_for_identical_text_is_one', () => {
    const text = 'apple banana cherry date elderberry fig grape honeydew';
    expect(cosineSimilarityOfWordBags(text, text)).toBeCloseTo(1.0);
  });

  // no overlapping words at all, --> cosine should be exactly zero
  test('test_cosine_for_disjoint_text_returns_zero', () => {
    const a = 'apple banana cherry';
    const b = 'tiger lion zebra';
    expect(cosineSimilarityOfWordBags(a, b)).toBe(0);
  });

});