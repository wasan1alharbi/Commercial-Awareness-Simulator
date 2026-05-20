import { jest, describe, test, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

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

let findExistingCompanyAgent: any;

beforeAll(async () => {
  const mod = await import('./index');
  findExistingCompanyAgent = mod.findExistingCompanyAgent;
});

// the lookup must use the composite index, not a full scan
describe('findExistingCompanyAgent index shape', () => {

  test('test_uses_composite_index_not_full_scan', () => {
    const src = fs.readFileSync(
  path.resolve(process.cwd(), 'convex/simulator/index.ts'),
  'utf-8',
);

    // narrow to the body of findExistingCompanyAgent so we don't accidentally
    // match strings from other functions in the same file
    const start = src.indexOf('export const findExistingCompanyAgent');
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf('export const', start + 1);
    const body = next === -1 ? src.slice(start) : src.slice(start, next);

    // composite worldIdAndName index, both eq predicates, then .unique()
    expect(body).toContain(".withIndex('worldIdAndName'");
    expect(body).toContain("q.eq('worldId'");
    expect(body).toContain(".eq('name'");
    expect(body).toContain('.unique()');

    // explicitly NOT a full table scan
    expect(body).not.toContain('.collect()');
  });

});

// same company name in two worlds, two different agents
describe('findExistingCompanyAgent cross-world isolation', () => {

  // tiny in-memory db that mimics ctx.db.query(...).withIndex(idx, cb).unique()
  function makeCtx(rows: Array<{ _id: string; worldId: string; name: string }>) {
    return {
      db: {
        query: (_table: string) => ({
          withIndex: (_idx: string, cb: any) => {
            const filter: any = {};
            const q: any = {
              eq: (field: string, val: any) => {
                filter[field] = val;
                return q;
              },
            };
            cb(q);
            const match = rows.find(
              (r) => r.worldId === filter.worldId && r.name === filter.name,
            );
            return {
              unique: async () => match ?? null,
            };
          },
        }),
      },
    };
  }

  test('test_same_name_in_two_worlds_returns_distinct_agents', async () => {
    const rows = [
      { _id: 'desc_world_A_apple', worldId: 'world_A', name: 'Apple' },
      { _id: 'desc_world_B_apple', worldId: 'world_B', name: 'Apple' },
    ];
    const ctx = makeCtx(rows);

    const inA = await findExistingCompanyAgent.handler(ctx, {
      worldId: 'world_A',
      companyName: 'Apple',
    });
    const inB = await findExistingCompanyAgent.handler(ctx, {
      worldId: 'world_B',
      companyName: 'Apple',
    });

    expect(inA?.agentDescId).toBe('desc_world_A_apple');
    expect(inB?.agentDescId).toBe('desc_world_B_apple');
    // sanity: same name, two worlds, different rows returned
    expect(inA?.agentDescId).not.toBe(inB?.agentDescId);

    // and a third world with no matching row gets nothing back
    const inC = await findExistingCompanyAgent.handler(ctx, {
      worldId: 'world_C',
      companyName: 'Apple',
    });
    expect(inC).toBeNull();
  });

});