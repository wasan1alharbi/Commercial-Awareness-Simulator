import { v } from 'convex/values';
import { action, internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { gateAgentPrompt, generateIdentityPrompt } from './gateAgent';
import { fetchWikipediaSummary } from './wikipedia';
import { characters } from '../../data/characters';
import { insertInput } from '../aiTown/insertInput';

function normalizeArticleText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export const insertArticle = internalMutation({
  args: {
    worldId: v.id('worlds'),
    rawText: v.string(),
    summary: v.string(),
    extractedCompanies: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('articles', {
      worldId: args.worldId,
      rawText: args.rawText,
      summary: args.summary,
      extractedCompanies: args.extractedCompanies,
      isValid: true,
      submittedAt: Date.now(),
    });
  },
});

export const patchWorldSummary = internalMutation({
  args: {
    worldId: v.id('worlds'),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.worldId, { currentArticleSummary: args.summary });
  },
});

export const findExistingCompanyAgent = internalQuery({
  args: {
    worldId: v.id('worlds'),
    companyName: v.string(),
  },
  handler: async (ctx, args) => {
    const agentDesc = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldIdAndName', (q) => q.eq('worldId', args.worldId).eq('name', args.companyName))
      .unique();
    if (!agentDesc) return null;
    return { agentDescId: agentDesc._id };
  },
});

export const patchAgentRelevance = internalMutation({
  args: {
    agentDescId: v.id('agentDescriptions'),
    articleRelevance: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.agentDescId, { articleRelevance: args.articleRelevance });
  },
});

export const getAgentCount = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    return world ? world.agents.length : 0;
  },
});

export const spawnCompanyAgent = internalMutation({
  args: {
    worldId: v.id('worlds'),
    name: v.string(),
    character: v.string(),
    identity: v.string(),
    plan: v.string(),
    industry: v.string(),
    products: v.array(v.string()),
    competitors: v.array(v.string()),
    goals: v.array(v.string()),
    motivation: v.string(),
    personality: v.string(),
    articleRelevance: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await insertInput(ctx, args.worldId, 'createAgentFromDescription', {
      name: args.name,
      character: args.character,
      identity: args.identity,
      plan: args.plan,
      industry: args.industry,
      products: args.products,
      competitors: args.competitors,
      goals: args.goals,
      motivation: args.motivation,
      personality: args.personality,
      articleRelevance: args.articleRelevance,
      country: args.country,
    });
  },
});

export const getWorldById = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.worldId);
  },
});

export const hasSameArticleTextAlready = internalQuery({
  args: {
    worldId: v.id('worlds'),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const want = normalizeArticleText(args.text);
    const rows = await ctx.db
      .query('articles')
      .withIndex('byWorld', (q) => q.eq('worldId', args.worldId))
      .collect();
    for (let i = 0; i < rows.length; i++) {
      if (normalizeArticleText(rows[i].rawText) === want) {
        return true;
      }
    }
    return false;
  },
});

export const submitArticle = action({
  args: {
    worldId: v.id('worlds'),
    text: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    rejectionReason?: string;
    articleId?: string;
    companies?: string[];
    summary?: string;
    newSpawns?: string[];
    alreadyHadAgents?: string[];
  }> => {
    const foundWorld = await ctx.runQuery(internal.simulator.index.getWorldById, {
      worldId: args.worldId,
    });

    if (foundWorld === null) {
      throw new Error('World ' + args.worldId + ' not found.');
    }

    if (args.text.length < 50) {
      return { success: false, rejectionReason: 'Article text must be at least 50 characters.' };
    }

    const alreadyHaveThis = await ctx.runQuery(internal.simulator.index.hasSameArticleTextAlready, {
      worldId: args.worldId,
      text: args.text,
    });
    if (alreadyHaveThis) {
      return { success: false, rejectionReason: 'You already submitted this article.' };
    }

    const result = await gateAgentPrompt(args.text);

    if (!result.isValid) {
      return { success: false, rejectionReason: result.rejectionReason ?? 'Not valid business news.' };
    }

    const articleId = await ctx.runMutation(internal.simulator.index.insertArticle, {
      worldId: args.worldId,
      rawText: args.text,
      summary: result.summary,
      extractedCompanies: result.companies,
    });

    await ctx.runMutation(internal.simulator.index.patchWorldSummary, {
      worldId: args.worldId,
      summary: result.summary,
    });

    const newSpawns: string[] = [];
    const alreadyHadAgents: string[] = [];

    for (let i = 0; i < result.companies.length; i++) {
      const compName = result.companies[i];

      const existingAgent = await ctx.runQuery(internal.simulator.index.findExistingCompanyAgent, {
        worldId: args.worldId,
        companyName: compName,
      });

      if (!existingAgent) {
        let wikiText = '';
        try {
          wikiText = await fetchWikipediaSummary(compName);
        } catch (e) {
          console.error('Wikipedia fetch failed for', compName, e);
          wikiText = 'No information available.';
        }

        const newIdentity = await generateIdentityPrompt(compName, wikiText, result.summary);

        const totalAgents = await ctx.runQuery(internal.simulator.index.getAgentCount, {
          worldId: args.worldId,
        });
        const charName = characters[totalAgents % characters.length].name;

        let idString = 'You are ' + compName + '. You are in the ' + newIdentity.industry + ' industry. \n';
        idString += 'Your products are: ' + newIdentity.products.join(', ') + '. \n';
        idString += 'Your rivals: ' + newIdentity.competitors.join(', ') + '. \n';
        idString += 'Motivation: ' + newIdentity.motivation + ' \n';
        idString += 'Personality: ' + newIdentity.personality;

        await ctx.runMutation(internal.simulator.index.spawnCompanyAgent, {
          worldId: args.worldId,
          name: compName,
          character: charName,
          identity: idString,
          plan: newIdentity.goals.join(' | '),
          industry: newIdentity.industry,
          products: newIdentity.products,
          competitors: newIdentity.competitors,
          goals: newIdentity.goals,
          motivation: newIdentity.motivation,
          personality: newIdentity.personality,
          articleRelevance: newIdentity.articleRelevance,
          country: newIdentity.country || 'Unknown',
        });
        newSpawns.push(compName);
      } else {
        const updateText = 'This breaking news directly impacts ' + compName + "'s current market strategy.";
        await ctx.runMutation(internal.simulator.index.patchAgentRelevance, {
          agentDescId: existingAgent.agentDescId,
          articleRelevance: updateText,
        });
        alreadyHadAgents.push(compName);
      }
    }

    return {
      success: true,
      articleId,
      companies: result.companies,
      summary: result.summary,
      newSpawns,
      alreadyHadAgents,
    };
  },
});
