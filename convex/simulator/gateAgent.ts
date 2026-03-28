import { chatCompletion } from '../util/llm';

export interface GateAgentResult {
  isValid: boolean;
  rejectionReason: string | null;
  companies: string[];
  summary: string;
}

export async function gateAgentPrompt(rawText: string): Promise<GateAgentResult> {
  const systemPrompt = `You are a commercial news validator. Given a text:
1. Is this real business news? (yes/no)
2. List all company names mentioned
3. Write a 2-3 sentence summary

Return ONLY valid JSON like this:
{ "isValid": true, "rejectionReason": null, "companies": ["Apple", "Google"], "summary": "..." }`;

  // Try up to 3 times in case the JSON parsing fails
  for (let i = 0; i < 3; i++) {
    try {
      const { content } = await chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText },
        ],
        temperature: 0,
      });

      const result = JSON.parse(content as string) as GateAgentResult;
      return result;
    } catch (err) {
      console.log(`Attempt ${i + 1} failed:`, err);
      if (i === 2) throw err;
    }
  }

  throw new Error('gateAgentPrompt failed after 3 attempts');
}
