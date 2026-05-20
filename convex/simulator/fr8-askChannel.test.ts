import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// FR8: Ask Channel. submit a question, system writes back an analyst answer.

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
      index: {
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

let submitAskQuestion: any;
let answerAskQuestion: any;

beforeAll(async () => {
  const mod = await import('./index');
  submitAskQuestion = (mod.submitAskQuestion as any).handler;
  answerAskQuestion = (mod.answerAskQuestion as any).handler;
});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('Ask Channel: submit a question, receive an analyst answer', () => {

  test('test_submit_inserts_row_and_schedules_answer', async () => {
    const inserts: any[] = [];
    const scheduled: any[] = [];
    const ctx = {
      db: {
        insert: jest.fn(async (table: string, doc: any) => {
          inserts.push({ table, doc });
          return 'ask_1';
        }),
      },
      scheduler: {
        runAfter: jest.fn(async (_ms: number, _ref: any, args: any) => {
          scheduled.push(args);
        }),
      },
    };

    const docId = await submitAskQuestion(ctx, {
      worldId: 'world_1',
      question: 'Which companies are involved?',
      context: 'Apple acquired Anthropic.',
    });

    expect(docId).toBe('ask_1');
    expect(inserts[0].table).toBe('askChats');
    expect(inserts[0].doc.question).toBe('Which companies are involved?');
    expect(inserts[0].doc.answer).toBeUndefined();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].askChatId).toBe('ask_1');
  });

  test('test_answer_uses_delimiter_contract_and_patches_answer_back', async () => {
    const patches: any[] = [];
    const ctx = {
      runQuery: jest.fn(async () => ({
        question: 'Which companies?',
        context: 'Apple acquired Anthropic for $50B.',
      })),
      runMutation: jest.fn(async (_ref: any, args: any) => {
        patches.push(args);
      }),
    };
    mockChatCompletion.mockResolvedValueOnce({ content: 'Apple and Anthropic.' });

    await answerAskQuestion(ctx, { askChatId: 'ask_1' });

    const callArgs: any = mockChatCompletion.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('=== SIMULATION STATE ===');
    expect(callArgs.messages[0].content).toContain('=== END STATE ===');
    expect(callArgs.messages[0].content).toContain('Apple acquired Anthropic for $50B.');
    expect(callArgs.messages[1].content).toBe('Which companies?');
    expect(patches).toHaveLength(1);
    expect(patches[0].answer).toBe('Apple and Anthropic.');
  });

  test('test_answer_throws_when_askChat_missing', async () => {
    const ctx = {
      runQuery: jest.fn(async () => null),
      runMutation: jest.fn(),
    };
    await expect(
      answerAskQuestion(ctx, { askChatId: 'missing' })
    ).rejects.toThrow(/askChat not found/);
  });
});
