import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// integration tests: chain multiple handlers in sequence to show that the system
// components work together end-to-end, not just in isolation.

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
        getAskChat: 'getAskChat',
        patchAskChatAnswer: 'patchAskChatAnswer',
        answerAskQuestion: 'answerAskQuestion',
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

let submitArticle: any;
let submitAskQuestion: any;
let answerAskQuestion: any;
let generateScenarioQuestions: any;
let evaluateImpact: any;

beforeAll(async () => {
  const mod = await import('./index');
  submitArticle = (mod.submitArticle as any).handler;
  submitAskQuestion = (mod.submitAskQuestion as any).handler;
  answerAskQuestion = (mod.answerAskQuestion as any).handler;
  generateScenarioQuestions = (mod as any).generateScenarioQuestions;
  evaluateImpact = (mod as any).evaluateImpact;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
  mockFetchWikipediaSummary.mockReset();
});

const ARTICLE = 'Apple acquired Anthropic in a $50 billion deal. Microsoft is watching closely.';

describe('end-to-end: article submission then Ask channel question', () => {

  test('a question asked after submitting an article reaches the LLM with that article in context', async () => {
    // step 1: submit article
    const mutationCalls: Array<{ ref: string; args: any }> = [];
    const articleCtx = {
      runQuery: jest.fn(async (ref: string, args: any) => {
        if (ref === 'getWorldById') return { _id: args.worldId, agents: [] };
        if (ref === 'hasSameArticleTextAlready') return false;
        if (ref === 'findExistingCompanyAgent') return null;
        if (ref === 'getAgentCount') return 0;
        throw new Error('unmocked: ' + ref);
      }),
      runMutation: jest.fn(async (ref: string, args: any) => {
        mutationCalls.push({ ref, args });
        if (ref === 'insertArticle') return 'article_1';
        return undefined;
      }),
      runAction: jest.fn(),
    };

    // gate response for the article + identity responses for both companies
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        isValid: true, rejectionReason: null,
        companies: ['Apple', 'Microsoft'],
        summary: 'Apple acquired Anthropic for $50B. Microsoft is watching closely.',
      }),
    });
    const identity = JSON.stringify({
      industry: 'Tech', products: ['p1', 'p2', 'p3'], competitors: ['c1', 'c2', 'c3'],
      goals: ['g1', 'g2'], motivation: 'm', personality: 'p',
      articleRelevance: 'r', country: 'US',
    });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });
    mockChatCompletion.mockResolvedValueOnce({ content: identity });
    mockFetchWikipediaSummary.mockResolvedValue('A tech company.');

    await submitArticle(articleCtx, { worldId: 'world_1', text: ARTICLE });

    // gate ran + at least one spawn ran
    expect(mockChatCompletion.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mutationCalls.find(c => c.ref === 'insertArticle')).toBeDefined();

    // step 2: student submits an Ask question about it
    const askInserts: any[] = [];
    const askScheduled: any[] = [];
    const askCtx = {
      db: { insert: jest.fn(async (table: string, doc: any) => { askInserts.push({ table, doc }); return 'ask_1'; }) },
      scheduler: { runAfter: jest.fn(async (_ms: number, _ref: any, args: any) => { askScheduled.push(args); }) },
    };
    await submitAskQuestion(askCtx, {
      worldId: 'world_1',
      question: 'What just happened with Apple?',
      context: 'Current article: Apple acquired Anthropic for $50B.',
    });
    expect(askInserts).toHaveLength(1);
    expect(askScheduled[0].askChatId).toBe('ask_1');

    // step 3: scheduled action runs and calls the LLM with the article context wrapped in delimiters
    const patches: any[] = [];
    const answerCtx = {
      runQuery: jest.fn(async () => ({
        question: 'What just happened with Apple?',
        context: 'Current article: Apple acquired Anthropic for $50B.',
      })),
      runMutation: jest.fn(async (_ref: any, args: any) => { patches.push(args); }),
    };
    mockChatCompletion.mockResolvedValueOnce({ content: 'Apple has acquired Anthropic in a $50B deal.' });

    await answerAskQuestion(answerCtx, { askChatId: 'ask_1' });

    const sys = mockChatCompletion.mock.calls[mockChatCompletion.mock.calls.length - 1][0].messages[0].content;
    expect(sys).toContain('=== SIMULATION STATE ===');
    expect(sys).toContain('Apple acquired Anthropic for $50B');
    expect(patches[0].answer).toBe('Apple has acquired Anthropic in a $50B deal.');
  });

});

describe('end-to-end: quiz pipeline from question generation to KPI delta', () => {

  test('generating a scenario question and evaluating a student answer produces a five-field KPI delta', async () => {
    // step 1: generate scenario questions for an article
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify([
        {
          id: 'q1',
          scenario: 'Apple just acquired Anthropic. As a competitor, how should Microsoft respond?',
          options: [
            { label: 'A', text: 'Match the move by acquiring another AI lab.' },
            { label: 'B', text: 'Double down on internal R&D.' },
            { label: 'C', text: 'Wait and see.' },
          ],
        },
      ]),
    });

    const questions = await generateScenarioQuestions(
      'Apple acquired Anthropic.',
      'medium',
      1,
    );
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toHaveLength(3);

    // step 2: student picks an option, system evaluates the KPI impact
    mockChatCompletion.mockResolvedValueOnce({
      content: JSON.stringify({
        profit: 30, marketShare: 20, liquidity: -40, trust: 5, compliance: 0,
      }),
    });

    const delta = await evaluateImpact(
      questions[0].scenario,
      questions[0].options[0].text,
      { profit: 50, marketShare: 50, liquidity: 50, trust: 50, compliance: 50 },
    );
    expect(delta).toEqual({ profit: 30, marketShare: 20, liquidity: -40, trust: 5, compliance: 0 });

    // step 3: clamping is applied at the snapshot boundary (covered in kpiBounds.test.ts)
  });

});
