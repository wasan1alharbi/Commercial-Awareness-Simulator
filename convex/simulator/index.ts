import { v } from 'convex/values';
import { internalAction, internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { gateAgentPrompt } from './gateAgent';

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

export const submitArticle = internalAction({
  args: {
    worldId: v.id('worlds'),
    rawText: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; rejectionReason?: string; articleId?: string; companies?: string[]; summary?: string }> => {
    if (args.rawText.length < 50) {
      return { success: false, rejectionReason: 'Article text must be at least 50 characters.' };
    }

    const result = await gateAgentPrompt(args.rawText);

    if (!result.isValid) {
      return { success: false, rejectionReason: result.rejectionReason ?? 'Not valid business news.' };
    }

    const articleId = await ctx.runMutation(internal.simulator.index.insertArticle, {
      worldId: args.worldId,
      rawText: args.rawText,
      summary: result.summary,
      extractedCompanies: result.companies,
    });

    await ctx.runMutation(internal.simulator.index.patchWorldSummary, {
      worldId: args.worldId,
      summary: result.summary,
    });

    return { success: true, articleId, companies: result.companies, summary: result.summary };
  },
});
