import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// submitting the same article twice --> not 2 agents of the same company
// also, first pass spawns, second pass only patches articleRelevance.

const mockChatCompletion = jest.fn() as any;
jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

const mockFetchWikipediaSummary = jest.fn() as any;
jest.unstable_mockModule('./wikipedia', () => ({
  fetchWikipediaSummary: mockFetchWikipediaSummary,
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
    string: () => 'string',
    id: (_: string) => 'id',
    optional: (x: any) => x,
    object: (x: any) => x,
    array: (x: any) => x,
    boolean: () => 'boolean',
    number: () => 'number',
    union: (...x: any[]) => x,
    literal: (x: any) => x,
  },
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
 
// flips after the first spawnCompanyAgent so the second
// submission sees the existing agent and takes the patch branch
function makeCtx() {
  const mutationCalls: Array<{ ref: string; args: any }> = [];
  let agentExists = false;
  const ctx = {
    runQuery: jest.fn(async (ref: string, args: any) => {
      if (ref === 'getWorldById') return { _id: args.worldId, agents: [] };
      if (ref === 'hasSameArticleTextAlready') return false;
      if (ref === 'findExistingCompanyAgent') {
        return agentExists ? { agentDescId: 'desc_apple' } : null;
      }
      if (ref === 'getAgentCount') return agentExists ? 1 : 0;
      throw new Error('unmocked query: ' + ref);
    }),
    runMutation: jest.fn(async (ref: string, args: any) => {
      mutationCalls.push({ ref, args });
      if (ref === 'insertArticle') return 'article_' + mutationCalls.length;
      if (ref === 'spawnCompanyAgent') agentExists = true;
      return undefined;
    }),
    runAction: jest.fn(),
  };
  return { ctx, mutationCalls };
}

const ARTICLE = 'Apple acquires Anthropic in landmark AI deal worth fifty billion dollars '
  + 'across global markets and infrastructure today.';

const GATE_RESPONSE = JSON.stringify({
  isValid: true,
  rejectionReason: null,
  companies: ['Apple'],
  summary: 'Apple acquired Anthropic in a landmark AI deal.',
});

const IDENTITY_RESPONSE = JSON.stringify({
  industry: 'Consumer electronics',
  products: ['iPhone', 'Mac', 'iPad'],
  competitors: ['Samsung', 'Google', 'Microsoft'],
  goals: ['Maintain margins', 'Expand AI'],
  motivation: 'Defend ecosystem',
  personality: 'Cautious, design-led, secretive',
  articleRelevance: 'This news affects Apple because Anthropic builds rival models.',
  country: 'United States',
});

describe('submitArticle: spawn-vs-patch fork', () => {

  // submit twice, should spawn once and patch once
  test('test_idempotent_resubmission_spawns_once_and_patches_once', async () => {
    const { ctx, mutationCalls } = makeCtx();
    // submission 1: gate then identity (spawn path)
    mockChatCompletion.mockResolvedValueOnce({ content: GATE_RESPONSE });
    mockChatCompletion.mockResolvedValueOnce({ content: IDENTITY_RESPONSE });
    // submission 2: gate only (patch path, no identity call)
    mockChatCompletion.mockResolvedValueOnce({ content: GATE_RESPONSE });
    mockFetchWikipediaSummary.mockResolvedValue('Apple Inc. is a tech company.');

    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });
    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });

    // one agent created total
    const spawnCalls = mutationCalls.filter(c => c.ref === 'spawnCompanyAgent');
    expect(spawnCalls).toHaveLength(1);

    // articleRelevance updated on second pass
    const patchCalls = mutationCalls.filter(c => c.ref === 'patchAgentRelevance');
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0].args.agentDescId).toBe('desc_apple');
    expect(typeof patchCalls[0].args.articleRelevance).toBe('string');

    // the patch only touches articleRelevance, other 7 fields are not in the payload
    expect(Object.keys(patchCalls[0].args).sort()).toEqual(['agentDescId', 'articleRelevance']);
    for (const k of ['industry', 'products', 'competitors', 'goals', 'motivation', 'personality', 'country']) {
      expect(patchCalls[0].args).not.toHaveProperty(k);
    }

    // 3 LLM calls total: gate, identity, gate (no second identity)
    expect(mockChatCompletion).toHaveBeenCalledTimes(3);

    // and Wikipedia was only fetched once (only the spawn path needs it)
    expect(mockFetchWikipediaSummary).toHaveBeenCalledTimes(1);
  });

  // patch text should be the exact templated string
  test('test_patch_template_uses_exact_breaking_news_string', async () => {
    const { ctx, mutationCalls } = makeCtx();
    mockChatCompletion.mockResolvedValueOnce({ content: GATE_RESPONSE });
    mockChatCompletion.mockResolvedValueOnce({ content: IDENTITY_RESPONSE });
    mockChatCompletion.mockResolvedValueOnce({ content: GATE_RESPONSE });
    mockFetchWikipediaSummary.mockResolvedValue('Apple Inc. is a tech company.');

    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });
    await submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE });

    const patch = mutationCalls.find(c => c.ref === 'patchAgentRelevance');
    expect(patch).toBeDefined();
    expect(patch!.args.articleRelevance).toBe(
      "This breaking news directly impacts Apple's current market strategy.",
    );
  });

});