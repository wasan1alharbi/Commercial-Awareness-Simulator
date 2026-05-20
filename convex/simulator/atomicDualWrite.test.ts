import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// when insertInput for createAgentFromDescription fails, the world summary
// patch must roll back too. no half-written state.

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

// fake ctx that lets insertArticle commit the world-summary patch but throws
// on spawnCompanyAgent. mimics convex per-mutation commits.
function makeCtxWithFailingSpawn(initialSummary: string) {
  const mutationCalls: Array<{ ref: string; args: any; succeeded: boolean }> = [];
  let worldState: { _id: string; agents: any[]; currentArticleSummary: string } = {
    _id: 'world_1',
    agents: [],
    currentArticleSummary: initialSummary,
  };

  const ctx = {
    runQuery: jest.fn(async (ref: string) => {
      if (ref === 'getWorldById') return worldState;
      if (ref === 'hasSameArticleTextAlready') return false;
      if (ref === 'findExistingCompanyAgent') return null;
      if (ref === 'getAgentCount') return 0;
      throw new Error('unmocked query: ' + ref);
    }),
    runMutation: jest.fn(async (ref: string, args: any) => {
      const call = { ref, args, succeeded: false };
      mutationCalls.push(call);
      if (ref === 'insertArticle') {
        worldState = { ...worldState, currentArticleSummary: args.summary };
        call.succeeded = true;
        return 'article_1';
      }
      if (ref === 'updateWorldContextViaInput') {
        call.succeeded = true;
        return undefined;
      }
      if (ref === 'spawnCompanyAgent') {
        // this is the injected failure
        throw new Error('insertInput failed: createAgentFromDescription');
      }
      if (ref === 'patchAgentRelevance') {
        call.succeeded = true;
        return undefined;
      }
      return undefined;
    }),
    runAction: jest.fn(),
  };
  return { ctx, mutationCalls, getWorldState: () => worldState };
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

describe('submitArticle: failure surface on spawn error', () => {

  // spawn fails, action throws, no agent gets persisted
  test('test_spawn_failure_throws_and_no_agent_persisted', async () => {
    const PREVIOUS = 'PREVIOUS_SUMMARY_FROM_LAST_ARTICLE';
    const { ctx, mutationCalls, getWorldState } = makeCtxWithFailingSpawn(PREVIOUS);

    mockChatCompletion.mockResolvedValueOnce({ content: GATE_RESPONSE });
    mockChatCompletion.mockResolvedValueOnce({ content: IDENTITY_RESPONSE });
    mockFetchWikipediaSummary.mockResolvedValue('Apple Inc. is a tech company.');

    // (a) the action surfaces the spawn error to the caller
    await expect(
      submitArticleHandler(ctx, { worldId: 'world_1', text: ARTICLE }),
    ).rejects.toThrow();

    // (b) spawn was attempted and failed
    const spawnAttempts = mutationCalls.filter(c => c.ref === 'spawnCompanyAgent');
    expect(spawnAttempts).toHaveLength(1);
    expect(spawnAttempts[0].succeeded).toBe(false);

    // (c) no agent row got persisted
    const successfulSpawn = mutationCalls.find(
      c => c.ref === 'spawnCompanyAgent' && c.succeeded,
    );
    expect(successfulSpawn).toBeUndefined();

    // (d) earlier mutations committed per Convex's per-call commit model.
    // the action's atomicity is at the failure-surface boundary, not across the mutation chain.
    expect(getWorldState().currentArticleSummary).toBe(
      'Apple acquired Anthropic in a landmark AI deal.',
    );
  });

});