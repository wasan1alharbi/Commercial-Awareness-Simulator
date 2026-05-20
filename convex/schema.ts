import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  articles: defineTable({
    worldId: v.id('worlds'),
    rawText: v.string(),
    summary: v.string(),
    extractedCompanies: v.array(v.string()),
    isValid: v.boolean(),
    submittedAt: v.number(),
  }).index('byWorld', ['worldId']),

  articleSubmissionLog: defineTable({
    worldId: v.id('worlds'),
    submittedAt: v.number(),
    charsIn: v.number(),
    outcome: v.union(v.literal('accepted'), v.literal('rejected')),
    rejectionStage: v.optional(
      v.union(v.literal('too_short'), v.literal('duplicate'), v.literal('gate')),
    ),
    rejectionReason: v.optional(v.string()),
    articleId: v.optional(v.id('articles')),
    extractedCompaniesCount: v.optional(v.number()),
    summaryChars: v.optional(v.number()),
  })
    .index('byWorld', ['worldId'])
    .index('byOutcome', ['worldId', 'outcome']),

  quizSessions: defineTable({
    worldId: v.id('worlds'),
    articleId: v.id('articles'),
    difficulty: v.union(v.literal('easy'), v.literal('medium'), v.literal('hard')),
    numQuestions: v.union(v.literal(3), v.literal(6), v.literal(10)),
    includeAgentContext: v.boolean(),
    questions: v.array(v.object({
      id: v.string(),
      scenario: v.string(),
      options: v.array(v.object({ label: v.string(), text: v.string() })),
      correctLabel: v.optional(v.string()),
    })),
    answers: v.array(v.object({
      questionId: v.string(),
      selectedLabel: v.string(),
      submittedAt: v.number(),
    })),
    status: v.union(v.literal('active'), v.literal('completed')),
    createdAt: v.number(),
    caseText: v.optional(v.string()),
    kpiRationale: v.optional(v.string()),
  }).index('byWorld', ['worldId']),

  askChats: defineTable({
    worldId: v.id('worlds'),
    question: v.string(),
    answer: v.optional(v.string()),
    context: v.string(),
    createdAt: v.number(),
  }).index('byWorld', ['worldId']),

  kpiSnapshots: defineTable({
    sessionId: v.id('quizSessions'),
    profit: v.number(),
    marketShare: v.number(),
    liquidity: v.number(),
    trust: v.number(),
    compliance: v.number(),
    updatedAt: v.number(),
  }).index('bySession', ['sessionId']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
