import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

const mockChatCompletion = jest.fn() as any;

jest.unstable_mockModule('../util/llm', () => ({
  chatCompletion: mockChatCompletion,
}));

jest.unstable_mockModule('../_generated/server', () => ({
  internalAction: (config: any) => config,
  internalMutation: (config: any) => config,
  internalQuery: (config: any) => config,
}));

jest.unstable_mockModule('../_generated/api', () => ({
  internal: {
    simulator: {
      assessorAgent: {
        getDefaultWorld: 'getDefaultWorld',
        getMemoriesForPlayer: 'getMemoriesForPlayer',
        patchAgentIdentity: 'patchAgentIdentity',
      },
      agentWorldContext: {
        getAgentDescriptionByAgentId: 'getAgentDescriptionByAgentId',
      },
    },
  },
}));

jest.unstable_mockModule('convex/values', () => ({
  __esModule: true,
  v: {
    string: () => 'string',
    number: () => 'number',
    id: () => 'id',
    optional: (x: any) => x,
    array: (x: any) => x,
  },
}));

let assessorHandler: any;

beforeAll(async () => {
  const mod = await import('./assessorAgent');
  assessorHandler = (mod.assessorAgent as any).handler;});

beforeEach(() => {
  mockChatCompletion.mockReset();
});

describe('assessorAgent', () => {

  test('makes zero LLM calls when agents have no new memories', async () => {
    const mockRunQuery = jest.fn() as any;
    const mockRunMutation = jest.fn() as any;

    mockRunQuery.mockImplementation((fnRef: unknown, args?: any) => {
      if (fnRef === 'getDefaultWorld') {
        return {
          worldId: 'world123',
          agents: [
            { id: 'agent1', playerId: 'player1' },
            { id: 'agent2', playerId: 'player2' },
          ],
        };
      }
      if (fnRef === 'getAgentDescriptionByAgentId') {
        return {
          _id: 'desc_' + args.agentId,
          name: args.agentId,
          goals: ['Grow revenue'],
          motivation: 'Expand market share',
          lastAssessedAt: 1000,
        };
      }
      if (fnRef === 'getMemoriesForPlayer') {
        return [];
      }
      return null;
    });

    const ctx = { runQuery: mockRunQuery, runMutation: mockRunMutation };

    await assessorHandler(ctx, {});

    expect(mockChatCompletion).not.toHaveBeenCalled();
    expect(mockRunMutation).not.toHaveBeenCalled();
  });

  // when there's a new memory and the LLM says identity should change,
  // we should ONLY patch goals + motivation + timestamp, not industry etc
  test('patches only goals, motivation, and lastAssessedAt when identity changed', async () => {
    const mockRunQuery = jest.fn() as any;
    const mockRunMutation = jest.fn() as any;

    mockRunQuery.mockImplementation((fnRef: unknown, args?: any) => {
      if (fnRef === 'getDefaultWorld') {
        return {
          worldId: 'world123',
          agents: [{ id: 'agent1', playerId: 'player1' }],
        };
      }
      if (fnRef === 'getAgentDescriptionByAgentId') {
        return {
          _id: 'desc_agent1',
          name: 'Agent One',
          goals: ['Old goal'],
          motivation: 'Old motivation',
          lastAssessedAt: 500,
        };
      }
      if (fnRef === 'getMemoriesForPlayer') {
        return [{ description: 'Learned about new market trend', _creationTime: 600 }];
      }
      return null;
    });

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({
        changed: true,
        newGoals: ['Pivot to AI services', 'Expand partnerships'],
        newMotivation: 'Leverage emerging AI trends',
      }),
    });

    const ctx = { runQuery: mockRunQuery, runMutation: mockRunMutation };

    await assessorHandler(ctx, {});

    expect(mockRunMutation).toHaveBeenCalledTimes(1);

    const patchPayload = mockRunMutation.mock.calls[0][1];

    expect(patchPayload.agentDescId).toBe('desc_agent1');
    expect(patchPayload.goals).toEqual(['Pivot to AI services', 'Expand partnerships']);
    expect(patchPayload.motivation).toBe('Leverage emerging AI trends');
    expect(typeof patchPayload.lastAssessedAt).toBe('number');

    // these locked identity fields should NEVER appear in the patch, bounded autonomy
    expect(patchPayload).not.toHaveProperty('industry');
    expect(patchPayload).not.toHaveProperty('products');
    expect(patchPayload).not.toHaveProperty('competitors');
    expect(patchPayload).not.toHaveProperty('personality');
  });

  // even when LLM says no change, we still tick the timestamp
  // so we don't re-ask about the same memory next time
  test('patches only agentDescId and lastAssessedAt when identity unchanged', async () => {
    const mockRunQuery = jest.fn() as any;
    const mockRunMutation = jest.fn() as any;

    mockRunQuery.mockImplementation((fnRef: unknown, args?: any) => {
      if (fnRef === 'getDefaultWorld') {
        return {
          worldId: 'world123',
          agents: [{ id: 'agent1', playerId: 'player1' }],
        };
      }
      if (fnRef === 'getAgentDescriptionByAgentId') {
        return {
          _id: 'desc_agent1',
          name: 'Agent One',
          goals: ['Stay the course'],
          motivation: 'Steady growth',
          lastAssessedAt: 500,
        };
      }
      if (fnRef === 'getMemoriesForPlayer') {
        return [{ description: 'Routine quarterly report', _creationTime: 600 }];
      }
      return null;
    });

    mockChatCompletion.mockResolvedValue({
      content: JSON.stringify({ changed: false }),
    });

    const ctx = { runQuery: mockRunQuery, runMutation: mockRunMutation };

    await assessorHandler(ctx, {});

    expect(mockRunMutation).toHaveBeenCalledTimes(1);

    const patchPayload = mockRunMutation.mock.calls[0][1];

    expect(patchPayload.agentDescId).toBe('desc_agent1');
    expect(typeof patchPayload.lastAssessedAt).toBe('number');

    // no goals/motivation update, no locked fields touched
    expect(patchPayload).not.toHaveProperty('goals');
    expect(patchPayload).not.toHaveProperty('motivation');
    expect(patchPayload).not.toHaveProperty('industry');
    expect(patchPayload).not.toHaveProperty('products');
    expect(patchPayload).not.toHaveProperty('competitors');
    expect(patchPayload).not.toHaveProperty('personality');
  });

});