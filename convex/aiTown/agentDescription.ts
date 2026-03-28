import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  name?: string;
  industry?: string;
  products?: string[];
  competitors?: string[];
  goals?: string[];
  motivation?: string;
  personality?: string;
  articleRelevance?: string;
  country?: string;
  lastAssessedAt?: number;

  constructor(serialized: SerializedAgentDescription) {
    const {
      agentId,
      identity,
      plan,
      name,
      industry,
      products,
      competitors,
      goals,
      motivation,
      personality,
      articleRelevance,
      country,
      lastAssessedAt,
    } = serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.plan = plan;
    this.name = name;
    this.industry = industry;
    this.products = products;
    this.competitors = competitors;
    this.goals = goals;
    this.motivation = motivation;
    this.personality = personality;
    this.articleRelevance = articleRelevance;
    this.country = country;
    this.lastAssessedAt = lastAssessedAt;
  }

  serialize(): SerializedAgentDescription {
    const {
      agentId,
      identity,
      plan,
      name,
      industry,
      products,
      competitors,
      goals,
      motivation,
      personality,
      articleRelevance,
      country,
      lastAssessedAt,
    } = this;
    return {
      agentId,
      identity,
      plan,
      name,
      industry,
      products,
      competitors,
      goals,
      motivation,
      personality,
      articleRelevance,
      country,
      lastAssessedAt,
    };
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  name: v.optional(v.string()),
  industry: v.optional(v.string()),
  products: v.optional(v.array(v.string())),
  competitors: v.optional(v.array(v.string())),
  goals: v.optional(v.array(v.string())),
  motivation: v.optional(v.string()),
  personality: v.optional(v.string()),
  articleRelevance: v.optional(v.string()),
  country: v.optional(v.string()),
  lastAssessedAt: v.optional(v.number()),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;
