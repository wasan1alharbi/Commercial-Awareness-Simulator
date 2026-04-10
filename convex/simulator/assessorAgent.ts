import { v } from 'convex/values';
import { internalAction, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';

export const getDefaultWorld = internalQuery({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();

    if (!worldStatus) return null;

    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) return null;

    return { worldId: worldStatus.worldId, agents: world.agents };
  },
});

export const getMemoriesForPlayer = internalQuery({
  args: { playerId: v.string(), since: v.number() },
  handler: async (ctx, args) => {
    const allMemories = await ctx.db
      .query('memories')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .collect();

    const newMemories = [];
    for (let i = 0; i < allMemories.length; i++) {
      if (allMemories[i]._creationTime > args.since) {
        newMemories.push(allMemories[i]);
      }
    }
    return newMemories;
  },
});

export const assessorAgent = internalAction({
  args: {},
  handler: async (ctx) => {
    const selfInternal = internal.simulator.assessorAgent as any;
    const agentWorldCtx = internal.simulator.agentWorldContext as any;

    const worldData = await ctx.runQuery(selfInternal.getDefaultWorld);

    if (!worldData) {
      console.log('Assessor: no default world found, skipping');
      return;
    }

    const worldId = worldData.worldId;
    const agents = worldData.agents;

    console.log('Assessor: found ' + agents.length + ' agents in world');

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];

      const agentDesc = await ctx.runQuery(
        agentWorldCtx.getAgentDescriptionByAgentId,
        { worldId: worldId, agentId: agent.id },
      );

      if (!agentDesc) {
        console.log('Assessor: no description for agent ' + agent.id + ', skipping');
        continue;
      }

      const lastAssessedAt = agentDesc.lastAssessedAt ?? 0;

      const newMemories = await ctx.runQuery(
        selfInternal.getMemoriesForPlayer,
        { playerId: agent.playerId, since: lastAssessedAt },
      );

      if (newMemories.length === 0) {
        console.log('Assessor: agent ' + (agentDesc.name ?? agent.id) + ' has no new memories, skipping');
        continue;
      }

      console.log(
        'Assessor: agent ' + (agentDesc.name ?? agent.id) + ' has ' + newMemories.length + ' new memories since last assessment',
      );
    }

    console.log('Assessor: run complete');
  },
});
