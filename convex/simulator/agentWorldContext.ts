import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { internal, api } from '../_generated/api';
import { chatCompletion, fetchEmbedding } from '../util/llm';

export type WorldContextAction = {
  action: 'makeStatement' | 'reflect' | 'seekAgent';
  targetAgentName?: string;
  statement?: string;
  reflection?: string;
};

// get the agent description from the DB
export const getAgentDescription = internalQuery({
  args: { agentDescriptionId: v.id('agentDescriptions') },
  handler: async (ctx, { agentDescriptionId }) => {
    return await ctx.db.get(agentDescriptionId);
  },
});

// get the current world context (article summary + public statements)
export const getWorldContext = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return null;
    return {
      currentArticleSummary: world.currentArticleSummary,
      publicStatements: world.publicStatements ?? [],
    };
  },
});

// get the playerId for an agent inside a world (needed to insert memories)
export const getPlayerIdForAgent = internalQuery({
  args: { worldId: v.id('worlds'), agentId: v.string() },
  handler: async (ctx, { worldId, agentId }) => {
    const world = await ctx.db.get(worldId);
    if (!world) return null;
    let foundPlayerId = null;
    for (const agent of world.agents) {
      if (agent.id === agentId) {
        foundPlayerId = agent.playerId;
        break;
      }
    }
    return foundPlayerId;
  },
});

// update the publicStatements array on the world document
// if the agent already has a statement, replace it, otherwise add a new one
export const updatePublicStatement = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentName: v.string(),
    statement: v.string(),
  },
  handler: async (ctx, { worldId, agentName, statement }) => {
    const world = await ctx.db.get(worldId);
    if (!world) {
      throw new Error('World not found: ' + worldId);
    }

    // copy the existing statements so we can modify them
    const existingStatements = world.publicStatements ?? [];
    const newStatements = [...existingStatements];

    // check if this agent already has a statement
    let alreadyExists = false;
    for (let i = 0; i < newStatements.length; i++) {
      if (newStatements[i].agentName === agentName) {
        // replace the old statement
        newStatements[i] = { agentName, statement, createdAt: Date.now() };
        alreadyExists = true;
        break;
      }
    }

    if (!alreadyExists) {
      newStatements.push({ agentName, statement, createdAt: Date.now() });
    }

    await ctx.db.patch(worldId, { publicStatements: newStatements });
    console.log('Agent ' + agentName + ' made a public statement: ' + statement);
  },
});

export const getAgentDescriptionByAgentId = internalQuery({
  args: { worldId: v.id('worlds'), agentId: v.string() },
  handler: async (ctx, { worldId, agentId }) => {
    return await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId).eq('agentId', agentId))
      .unique();
  },
});

async function callLLMForWorldContext(systemPrompt: string): Promise<WorldContextAction> {
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'What do you do next given this new world context? Respond with JSON only.' },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(String(content));

  const action = parsed.action;
  if (action !== 'makeStatement' && action !== 'reflect' && action !== 'seekAgent') {
    throw new Error('Invalid action value: ' + parsed.action);
  }

  const result: WorldContextAction = { action };
  if (parsed.targetAgentName) result.targetAgentName = parsed.targetAgentName;
  if (parsed.statement) result.statement = parsed.statement;
  if (parsed.reflection) result.reflection = parsed.reflection;

  return result;
}

// main action: look at the world context and decide what to do next
export const agentProcessWorldContext = internalAction({
  args: {
    agentId: v.string(),
    worldId: v.id('worlds'),
    operationId: v.string(),
  },
  returns: v.object({
    action: v.union(
      v.literal('makeStatement'),
      v.literal('reflect'),
      v.literal('seekAgent'),
    ),
    targetAgentName: v.optional(v.string()),
    statement: v.optional(v.string()),
    reflection: v.optional(v.string()),
  }),
  handler: async (ctx, { agentId, worldId, operationId }): Promise<WorldContextAction> => {
    // get the agent's identity info
    const agentDesc = await ctx.runQuery(
      internal.simulator.agentWorldContext.getAgentDescriptionByAgentId,
      { worldId, agentId },
    );
    if (!agentDesc) {
      throw new Error('AgentDescription not found for agent: ' + agentId);
    }

    // get the current world context
    const world = await ctx.runQuery(
      internal.simulator.agentWorldContext.getWorldContext,
      { worldId },
    );
    if (!world) {
      throw new Error('World not found: ' + worldId);
    }

    // build the prompt
    const name = agentDesc.name ?? 'Unknown Company';
    const industry = agentDesc.industry ?? 'Unknown Industry';
    const products = (agentDesc.products ?? []).join(', ') || 'N/A';
    const competitors = (agentDesc.competitors ?? []).join(', ') || 'N/A';
    const goals = (agentDesc.goals ?? []).join('; ') || 'N/A';
    const motivation = agentDesc.motivation ?? 'N/A';
    const personality = agentDesc.personality ?? 'N/A';
    const articleRelevance = agentDesc.articleRelevance ?? '';
    const currentArticleSummary = world.currentArticleSummary ?? '(no article yet)';
    const publicStatements = world.publicStatements;

    let statementsText = '  (none yet)';
    if (publicStatements.length > 0) {
      statementsText = '';
      for (const s of publicStatements) {
        statementsText += `  - ${s.agentName}: "${s.statement}"\n`;
      }
    }

    let systemPrompt = `You are ${name}. The world context has changed.\n`;
    systemPrompt += `Identity:\n`;
    systemPrompt += `  Industry: ${industry}\n`;
    systemPrompt += `  Products: ${products}\n`;
    systemPrompt += `  Competitors: ${competitors}\n`;
    systemPrompt += `  Goals: ${goals}\n`;
    systemPrompt += `  Motivation: ${motivation}\n`;
    systemPrompt += `  Personality: ${personality}\n`;
    if (articleRelevance) {
      systemPrompt += `  Your stance on news: ${articleRelevance}\n`;
    }
    systemPrompt += `\nCurrent news: ${currentArticleSummary}\n`;
    systemPrompt += `\nPublic statements from other companies:\n${statementsText}\n`;
    systemPrompt += `Decide your next action. Return ONLY valid JSON:\n`;
    systemPrompt += `{ "action": "seekAgent" | "makeStatement" | "reflect", "targetAgentName": string | null, "statement": string | null, "reflection": string | null }`;

    let lastError: any;
    let result: WorldContextAction | undefined;

    try {
      result = await callLLMForWorldContext(systemPrompt);
    } catch (err) {
      lastError = err;
    }

    if (!result) {
      try {
        result = await callLLMForWorldContext(systemPrompt);
      } catch (err) {
        lastError = err;
      }
    }

    if (!result) {
      try {
        result = await callLLMForWorldContext(systemPrompt);
      } catch (err) {
        lastError = err;
      }
    }

    if (!result) {
      // Clear the operation even on failure so the agent isn't stuck
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId,
        name: 'finishProcessWorldContext',
        args: { operationId, agentId },
      });
      throw lastError;
    }

    // Handle the action result
    await ctx.runAction(internal.simulator.agentWorldContext.handleWorldContextAction, {
      worldId,
      agentId,
      agentDescriptionId: agentDesc._id,
      result: {
        action: result.action,
        targetAgentName: result.targetAgentName,
        statement: result.statement,
        reflection: result.reflection,
      },
    });

    // Clear the in-progress operation via engine input
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId,
      name: 'finishProcessWorldContext',
      args: { operationId, agentId },
    });

    return result;
  },
});

export const handleWorldContextAction = internalAction({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    agentDescriptionId: v.id('agentDescriptions'),
    result: v.object({
      action: v.string(),
      targetAgentName: v.optional(v.string()),
      statement: v.optional(v.string()),
      reflection: v.optional(v.string()),
    }),
  },
  returns: v.object({ targetPlayerId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    let agentDesc = await ctx.runQuery(
      internal.simulator.agentWorldContext.getAgentDescription,
      { agentDescriptionId: args.agentDescriptionId },
    );
    let agentName = 'Unknown';
    if (agentDesc !== null && agentDesc !== undefined) {
      agentName = agentDesc.name ?? 'Unknown';
    }

    console.log('Agent ' + agentName + ' chose action: ' + args.result.action);

    if (args.result.action === 'makeStatement') {
      let statementText = '';
      if (args.result.statement !== undefined) {
        statementText = args.result.statement;
      }
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: args.worldId,
        name: 'updatePublicStatement',
        args: {
          agentName: agentName,
          statement: statementText,
        },
      });
      return {};
    } else if (args.result.action === 'reflect') {
      let reflectionText = '';
      if (args.result.reflection !== undefined) {
        reflectionText = args.result.reflection;
      }
      let playerId = await ctx.runQuery(
        internal.simulator.agentWorldContext.getPlayerIdForAgent,
        { worldId: args.worldId, agentId: args.agentId },
      );
      if (playerId !== null) {
        let embeddingResult = await fetchEmbedding(reflectionText);
        let textEmbedding = embeddingResult.embedding;
        await ctx.runMutation(internal.agent.memory.insertMemory, {
          agentId: args.agentId,
          playerId: playerId,
          description: reflectionText,
          embedding: textEmbedding,
          importance: 5,
          lastAccess: Date.now(),
          data: {
            type: 'reflection',
            relatedMemoryIds: [],
          },
        });
        console.log('Agent ' + agentName + ' stored a reflection: ' + reflectionText);
        return {};
      } else {
        console.log('Error: Could not find playerId for agent ' + args.agentId);
        return {};
      }
    } else if (args.result.action === 'seekAgent') {
      let targetName = undefined;
      if (args.result.targetAgentName !== undefined) {
        targetName = args.result.targetAgentName;
      }
      console.log('Agent ' + agentName + ' wants to seek: ' + targetName);
      return { targetPlayerId: targetName };
    } else {
      return {};
    }
  },
});
