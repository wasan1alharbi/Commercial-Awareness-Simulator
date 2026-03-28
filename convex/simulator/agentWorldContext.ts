import { v } from 'convex/values';
import { internalAction, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { chatCompletion } from '../util/llm';

export type WorldContextAction = {
  action: 'makeStatement' | 'reflect' | 'seekAgent';
  targetAgentName?: string;
  statement?: string;
  reflection?: string;
};

// fetch agent description by ID
export const getAgentDescription = internalQuery({
  args: { agentDescriptionId: v.id('agentDescriptions') },
  handler: async (ctx, { agentDescriptionId }) => {
    return await ctx.db.get(agentDescriptionId);
  },
});

// fetch world context fields
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

// process world context and decide next agent action
export const agentProcessWorldContext = internalAction({
  args: {
    agentDescriptionId: v.id('agentDescriptions'),
    worldId: v.id('worlds'),
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
  handler: async (ctx, { agentDescriptionId, worldId }): Promise<WorldContextAction> => {
    // Fetch structured identity
    const agentDesc = await ctx.runQuery(
      internal.simulator.agentWorldContext.getAgentDescription,
      { agentDescriptionId },
    );
    if (!agentDesc) {
      throw new Error(`AgentDescription not found: ${agentDescriptionId}`);
    }

    // Fetch world context
    const world = await ctx.runQuery(
      internal.simulator.agentWorldContext.getWorldContext,
      { worldId },
    );
    if (!world) {
      throw new Error(`World not found: ${worldId}`);
    }

    const { currentArticleSummary, publicStatements } = world;

    // Build the system prompt with structured identity + world context
    const name = agentDesc.name ?? 'Unknown Company';
    const industry = agentDesc.industry ?? 'Unknown Industry';
    const products = (agentDesc.products ?? []).join(', ') || 'N/A';
    const competitors = (agentDesc.competitors ?? []).join(', ') || 'N/A';
    const goals = (agentDesc.goals ?? []).join('; ') || 'N/A';
    const motivation = agentDesc.motivation ?? 'N/A';
    const personality = agentDesc.personality ?? 'N/A';
    const articleRelevance = agentDesc.articleRelevance ?? '';

    const statementsText =
      publicStatements.length > 0
        ? publicStatements.map((s) => `  - ${s.agentName}: "${s.statement}"`).join('\n')
        : '  (none yet)';

    const systemPrompt = [
      `You are ${name}. The world context has changed.`,
      `Identity:`,
      `  Industry: ${industry}`,
      `  Products: ${products}`,
      `  Competitors: ${competitors}`,
      `  Goals: ${goals}`,
      `  Motivation: ${motivation}`,
      `  Personality: ${personality}`,
      ...(articleRelevance ? [`  Your stance on news: ${articleRelevance}`] : []),
      ``,
      `Current news: ${currentArticleSummary ?? '(no article yet)'}`,
      ``,
      `Public statements from other companies:`,
      statementsText,
      ``,
      `Decide your next action. Return ONLY valid JSON:`,
      `{ "action": "seekAgent" | "makeStatement" | "reflect", "targetAgentName": string | null, "statement": string | null, "reflection": string | null }`,
    ].join('\n');

    for (let i = 0; i < 3; i++) {
      try {
        const { content } = await chatCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: 'What do you do next given this new world context? Respond with JSON only.',
            },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(content as string) as {
          action: string;
          targetAgentName?: string | null;
          statement?: string | null;
          reflection?: string | null;
        };

        const action = parsed.action as WorldContextAction['action'];
        if (action !== 'makeStatement' && action !== 'reflect' && action !== 'seekAgent') {
          throw new Error(`Invalid action value: ${parsed.action}`);
        }

        const result: WorldContextAction = { action };
        if (parsed.targetAgentName) result.targetAgentName = parsed.targetAgentName;
        if (parsed.statement) result.statement = parsed.statement;
        if (parsed.reflection) result.reflection = parsed.reflection;

        return result;
      } catch (err) {
        if (i === 2) throw err;
      }
    }

    throw new Error('agentProcessWorldContext failed after retries');
  },
});
