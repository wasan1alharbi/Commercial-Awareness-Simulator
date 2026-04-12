import { v } from 'convex/values';
import { action, query, mutation, internalAction, internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { chatCompletion } from '../util/llm';
import { gateAgentPrompt, generateIdentityPrompt } from './gateAgent';
import { fetchWikipediaSummary } from './wikipedia';
import { characters } from '../../data/characters';
import { insertInput } from '../aiTown/insertInput';

const COSINE_DUPLICATE_CUTOFF = 0.92;

function normalizeArticleText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  const w = text.match(/[a-z0-9]+/g);
  return w ? w.length : 0;
}

function wordCountsForCosine(text: string): Map<string, number> {
  const words = text.match(/[a-z0-9]+/g);
  const counts = new Map<string, number>();
  if (!words) {
    return counts;
  }
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return counts;
}

function cosineSimilarityOfWordBags(left: string, right: string): number {
  const ca = wordCountsForCosine(left);
  const cb = wordCountsForCosine(right);
  let sumLeft = 0;
  let sumRight = 0;
  for (const [, n] of ca) {
    sumLeft += n * n;
  }
  for (const [, n] of cb) {
    sumRight += n * n;
  }
  if (sumLeft === 0 || sumRight === 0) {
    return 0;
  }
  let dot = 0;
  for (const [word, nLeft] of ca) {
    const nRight = cb.get(word);
    if (nRight !== undefined) {
      dot += nLeft * nRight;
    }
  }
  return dot / (Math.sqrt(sumLeft) * Math.sqrt(sumRight));
}

function isSameArticleForDuplicateCheck(a: string, b: string): boolean {
  const one = normalizeArticleText(a);
  const two = normalizeArticleText(b);
  if (one === two) {
    return true;
  }
  if (countWords(one) < 15 || countWords(two) < 15) {
    return false;
  }
  return cosineSimilarityOfWordBags(one, two) >= COSINE_DUPLICATE_CUTOFF;
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
    const rows = await ctx.db
      .query('articles')
      .withIndex('byWorld', (q) => q.eq('worldId', args.worldId))
      .collect();
    for (let i = 0; i < rows.length; i++) {
      if (isSameArticleForDuplicateCheck(args.text, rows[i].rawText)) {
        return true;
      }
    }
    return false;
  },
});

export const updateWorldContextViaInput = internalMutation({
  args: {
    worldId: v.id('worlds'),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await insertInput(ctx, args.worldId, 'updateWorldContext', {
      summary: args.summary,
    });
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

    await ctx.runMutation(internal.simulator.index.updateWorldContextViaInput, {
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


export const listAskChats = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('askChats')
      .withIndex('byWorld', (q) => q.eq('worldId', args.worldId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});

export const submitAskQuestion = mutation({
  args: {
    worldId: v.id('worlds'),
    question: v.string(),
    context: v.string(),
  },
  handler: async (ctx, args) => {
    const docId = await ctx.db.insert('askChats', {
      worldId: args.worldId,
      question: args.question,
      answer: undefined,
      context: args.context,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.simulator.index.answerAskQuestion, {
      askChatId: docId,
    });
    return docId;
  },
});


export const getAskChat = internalQuery({
  args: { askChatId: v.id('askChats') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.askChatId);
  },
});

export const patchAskChatAnswer = internalMutation({
  args: {
    askChatId: v.id('askChats'),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.askChatId, { answer: args.answer });
  },
});

export const answerAskQuestion = internalAction({
  args: { askChatId: v.id('askChats') },
  handler: async (ctx, args) => {
    const askChat = await ctx.runQuery(internal.simulator.index.getAskChat, {
      askChatId: args.askChatId,
    });

    if (!askChat) {
      throw new Error('askChat not found: ' + args.askChatId);
    }

    const systemPrompt =
      'You are a helpful assistant. The user is looking at this context from a business simulation: ' +
      askChat.context +
      '. Answer their question concisely.';

    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: askChat.question },
      ],
      temperature: 0.7,
    });

    const answer = content as string;

    await ctx.runMutation(internal.simulator.index.patchAskChatAnswer, {
      askChatId: args.askChatId,
      answer: answer,
    });
  },
});

export const getArticleById = internalQuery({
  args: { articleId: v.id('articles') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.articleId);
  },
});

export const insertQuizSession = internalMutation({
  args: {
    worldId: v.id('worlds'),
    articleId: v.id('articles'),
    difficulty: v.union(v.literal('easy'), v.literal('medium'), v.literal('hard')),
    numQuestions: v.union(v.literal(3), v.literal(6), v.literal(10)),
    includeAgentContext: v.boolean(),
    questions: v.array(
      v.object({
        id: v.string(),
        scenario: v.string(),
        options: v.array(v.object({ label: v.string(), text: v.string() })),
        correctLabel: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('quizSessions', {
      worldId: args.worldId,
      articleId: args.articleId,
      difficulty: args.difficulty,
      numQuestions: args.numQuestions,
      includeAgentContext: args.includeAgentContext,
      questions: args.questions,
      answers: [],
      status: 'active',
      createdAt: Date.now(),
    });
  },
});

export const insertInitialKpiSnapshot = internalMutation({
  args: { sessionId: v.id('quizSessions') },
  handler: async (ctx, args) => {
    return await ctx.db.insert('kpiSnapshots', {
      sessionId: args.sessionId,
      profit: 0,
      marketShare: 0,
      liquidity: 0,
      trust: 0,
      compliance: 0,
      updatedAt: Date.now(),
    });
  },
});

async function generateScenarioQuestions(
  articleSummary: string,
  difficulty: string,
  count: number,
  agentContext?: string,
): Promise<Array<{ id: string; scenario: string; options: Array<{ label: string; text: string }> }>> {
  const difficultyGuide =
    difficulty === 'easy'
      ? 'Questions should test basic comprehension of the news.'
      : difficulty === 'medium'
        ? 'Questions should require applying business concepts to the scenario.'
        : 'Questions should require strategic analysis and multi-step reasoning.';

  let contextBlock = '';
  if (agentContext) {
    contextBlock = '\nAgent context from the simulation:\n' + agentContext + '\n';
  }

  const systemPrompt =
    'You are a business education quiz generator. Given a news summary, generate scenario-based multiple choice questions.\n' +
    difficultyGuide +
    '\nEach question must have 2-4 options with unique single-letter labels (A, B, C, D).\n' +
    'Return ONLY a valid JSON array of objects with keys: id (string like "q1", "q2"), scenario (the question text), options (array of {label, text}).';

  const userPrompt =
    'Article summary: ' + articleSummary + contextBlock + '\nGenerate exactly ' + count + ' questions.';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { content } = await chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      });
      const raw = (content as string).trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Expected a non-empty array of questions');
      }
      return parsed;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error('generateScenarioQuestions failed after 3 attempts');
}

export const startQuiz = action({
  args: {
    articleId: v.id('articles'),
    difficulty: v.union(v.literal('easy'), v.literal('medium'), v.literal('hard')),
    numQuestions: v.union(v.literal(3), v.literal(6), v.literal(10)),
    includeAgentContext: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ sessionId: string }> => {
    const article = await ctx.runQuery(internal.simulator.index.getArticleById, {
      articleId: args.articleId,
    });

    if (!article) {
      throw new Error('Article not found: ' + args.articleId);
    }

    let agentContext: string | undefined;
    if (args.includeAgentContext) {
      const world = await ctx.runQuery(internal.simulator.index.getWorldById, {
        worldId: article.worldId,
      });
      if (world && world.publicStatements && world.publicStatements.length > 0) {
        const statements = world.publicStatements.map(
          (s: { agentName: string; statement: string }) => s.agentName + ': ' + s.statement,
        );
        agentContext = statements.join('\n');
      }
    }

    const questions = await generateScenarioQuestions(
      article.summary,
      args.difficulty,
      args.numQuestions,
      agentContext,
    );

    const sessionId = await ctx.runMutation(internal.simulator.index.insertQuizSession, {
      worldId: article.worldId,
      articleId: args.articleId,
      difficulty: args.difficulty,
      numQuestions: args.numQuestions,
      includeAgentContext: args.includeAgentContext,
      questions: questions,
    });

    await ctx.runMutation(internal.simulator.index.insertInitialKpiSnapshot, {
      sessionId: sessionId,
    });

    return { sessionId };
  },
});

export const listArchivedConversations = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();

    const withMessages = conversations.filter((c) => c.numMessages > 0);
    withMessages.sort((a, b) => b.ended - a.ended);
    return withMessages;
  },
});
