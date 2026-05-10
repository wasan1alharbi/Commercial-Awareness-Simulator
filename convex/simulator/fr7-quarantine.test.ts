import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// raw article text should only reach the gate agent.
// downstream LLM calls only see the gate summary.

const MARKER = '__LEAK_THIS__HAHA_HAHA_HAHA__';

const mockChatCompletion = jest.fn() as any;
jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

const mockFetchWikipediaSummary = jest.fn() as any;
jest.unstable_mockModule('./wikipedia', () => ({
  fetchWikipediaSummary: mockFetchWikipediaSummary,
}));

// for convex imports during the test
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
      index: {
        getWorldById: 'getWorldById',
        hasSameArticleTextAlready: 'hasSameArticleTextAlready',
        insertArticle: 'insertArticle',
        updateWorldContextViaInput: 'updateWorldContextViaInput',
        findExistingCompanyAgent: 'findExistingCompanyAgent',
        getAgentCount: 'getAgentCount',
        spawnCompanyAgent: 'spawnCompanyAgent',
        patchAgentRelevance: 'patchAgentRelevance',
      },
      assessorAgent: {},
      agentWorldContext: {},
    },
  },
}));

jest.unstable_mockModule('../aiTown/insertInput', () => ({
  insertInput: jest.fn(),
}));

jest.unstable_mockModule('convex/values', () => ({
  __esModule: true,
  v: {
    string: () => 'string', number: () => 'number', boolean: () => 'boolean',
    id: (_: string) => 'id', optional: (x: any) => x, array: (x: any) => x,
    object: (x: any) => x, union: (...x: any[]) => x, literal: (x: any) => x,
    any: () => 'any', null: () => 'null', bytes: () => 'bytes', int64: () => 'int64',
  },
  convexToJson: (x: any) => x,
  jsonToConvex: (x: any) => x,
  ConvexError: class ConvexError extends Error {},
  isValidator: () => true,
  parseArgs: (x: any) => x,
}));

let submitArticleHandler: any;

beforeAll(async () => {
  const mod = await import('./index');
  submitArticleHandler = (mod.submitArticle as any).handler;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
  mockFetchWikipediaSummary.mockReset();
});

function makeCtx() {
  const mutationCalls: Array<{ ref: string; args: any }> = [];
  const ctx = {
    runQuery: jest.fn(async (ref: string) => {
      if (ref === 'getWorldById') return { _id: 'world_1', agents: [] };
      if (ref === 'hasSameArticleTextAlready') return false;
      if (ref === 'findExistingCompanyAgent') return null;
      if (ref === 'getAgentCount') return 0;
      throw new Error('unmocked query: ' + ref);
    }),
    runMutation: jest.fn(async (ref: string, args: any) => {
      mutationCalls.push({ ref, args });
      if (ref === 'insertArticle') return 'article_1';
      return undefined;
    }),
    runAction: jest.fn(),
  };
  return { ctx, mutationCalls };
}

const ARTICLE = 'Apple acquires Anthropic in landmark AI deal worth fifty billion dollars across global markets today. '
  + MARKER
  + ' Trading volumes surged after the announcement was made public.';

describe('submitArticle: raw text is quarantined from downstream LLM calls', () => {

  // gate is the only LLM call that should see raw text. quick check.
  test('test_gate_agent_does_receive_raw_article', async () => {
    const { ctx } = makeCtx();
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        isValid: true, rejectionReason: null, companies: [],
        summary: 'Apple acquired Anthropic.',
      }),
    });

    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });

    const gateArgs = JSON.stringify(mockChatCompletion.mock.calls[0][0]);
    expect(gateArgs).toContain(MARKER);
  });

  // identity LLM call should only see the summary
  test('test_marker_does_not_appear_in_identity_llm_call', async () => {
    const { ctx } = makeCtx();
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        isValid: true, rejectionReason: null,
        companies: ['Apple'],
        summary: 'Apple acquired Anthropic in a landmark AI deal.',
      }),
    });
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        industry: 'Tech', products: ['iPhone', 'Mac', 'iPad'],
        competitors: ['Samsung', 'Google', 'Microsoft'],
        goals: ['expand AI', 'grow services'], motivation: 'AI leadership',
        personality: 'innovative and secretive',
        articleRelevance: 'major AI acquisition', country: 'US',
      }),
    });
    mockFetchWikipediaSummary.mockResolvedValueOnce('Apple Inc. is a tech company.');

    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });

    const identityArgs = JSON.stringify(mockChatCompletion.mock.calls[1][0]);
    expect(identityArgs).not.toContain(MARKER);
  });

  test('test_raw_article_is_persisted_to_db_with_marker', async () => {
    const { ctx, mutationCalls } = makeCtx();
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        isValid: true, rejectionReason: null, companies: [],
        summary: 'Apple acquired Anthropic.',
      }),
    });

    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });

    const insert = mutationCalls.find(c => c.ref === 'insertArticle');
    expect(insert!.args.rawText).toContain(MARKER);
    expect(insert!.args.summary).not.toContain(MARKER);
  });

  // every LLM call after the gate must not contain the marker, quick check to catch any leaks.
  test('test_no_chatCompletion_call_after_gate_contains_marker', async () => {
    const { ctx } = makeCtx();
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        isValid: true, rejectionReason: null,
        companies: ['Apple', 'Microsoft'],
        summary: 'Apple and Microsoft announce alliance.',
      }),
    });
    const identity = JSON.stringify({
      industry: 'Tech', products: ['iPhone', 'Mac', 'iPad'],
      competitors: ['Samsung', 'Google', 'Meta'],
      goals: ['expand AI', 'grow services'], motivation: 'AI leadership',
      personality: 'innovative', articleRelevance: 'AI alliance', country: 'US',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });
    mockFetchWikipediaSummary.mockResolvedValue('Tech company.');

    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });

    const downstream = mockChatCompletion.mock.calls.slice(1);
    for (let i = 0; i < downstream.length; i++) {
      expect(JSON.stringify(downstream[i])).not.toContain(MARKER);
    }
  });

});