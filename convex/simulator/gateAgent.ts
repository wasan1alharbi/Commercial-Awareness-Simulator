import { chatCompletion } from '../util/llm';

export interface AgentIdentity {
  industry: string;
  products: string[];
  competitors: string[];
  goals: string[];
  motivation: string;
  personality: string;
  articleRelevance: string;
  country: string;
}

export interface GateAgentResult {
  isValid: boolean;
  rejectionReason: string | null;
  companies: string[];
  summary: string;
}

export async function gateAgentPrompt(rawText: string): Promise<GateAgentResult> {
  const prompt = `You are a commercial news validator. Given a text:
1. Is this real business news?
2. List all company names mentioned
3. Write a 2-3 sentence summary

Return ONLY valid JSON with keys: isValid, rejectionReason, companies, summary`;

  for (let i = 0; i < 3; i++) {
    try {
      const { content } = await chatCompletion({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: rawText },
        ],
        temperature: 0,
      });
      return JSON.parse(content as string) as GateAgentResult;
    } catch (err) {
      if (i === 2) throw err;
    }
  }
  throw new Error('gateAgentPrompt failed');
}

export async function generateIdentityPrompt(
  companyName: string,
  wikiExtract: string,
  articleSummary: string,
): Promise<AgentIdentity> {
  const prompt = `Generate a JSON identity for ${companyName} as a market agent.
Return ONLY valid JSON with keys: industry, products (array of 3), competitors (array of 3),
goals (array of 2), motivation, personality, country, articleRelevance.
articleRelevance should be: "This news affects ${companyName} because..."`;

  const userMsg = `Company: ${companyName}
Wikipedia: ${wikiExtract || 'no data'}
News: ${articleSummary}`;

  for (let i = 0; i < 3; i++) {
    try {
      const { content } = await chatCompletion({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
      });
      return JSON.parse(content as string) as AgentIdentity;
    } catch (err) {
      if (i === 2) throw err;
    }
  }
  throw new Error('generateIdentityPrompt failed');
}

