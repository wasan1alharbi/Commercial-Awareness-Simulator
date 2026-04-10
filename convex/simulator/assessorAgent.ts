import { v } from 'convex/values';
import { internalAction, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { chatCompletion } from '../util/llm';

export interface IdentityChangeResult {
  changed: boolean;
  newGoals?: string[];
  newMotivation?: string;
}

export async function shouldIdentityChange(
  currentGoals: string[],
  currentMotivation: string,
  memoryDescriptions: string[],
): Promise<IdentityChangeResult> {
  const systemPrompt = `You are an identity assessor for a company agent in a business simulation.
Given the agent's current goals, motivation, and recent memories, decide if the agent's goals or motivation should change.
Only recommend changes if the memories provide strong evidence that the agent's strategic direction has shifted.
Return ONLY valid JSON: { "changed": boolean, "newGoals": string[] (2 items, only if changed), "newMotivation": string (only if changed) }`;

  const memorySummary = memoryDescriptions.join('\n- ');

  const userMsg = `Current goals: ${JSON.stringify(currentGoals)}
Current motivation: ${currentMotivation}

Recent memories:
- ${memorySummary}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { content } = await chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
      });
      return JSON.parse(content as string) as IdentityChangeResult;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error('shouldIdentityChange failed after 3 attempts');
}

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
