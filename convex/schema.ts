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
  }).index('byWorld', ['worldId']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
