import { chatCompletion } from '../util/llm';

export async function scoreStatementOutcome(
  statement: string,
  identity: any,
): Promise<number> {
  const systemPrompt =
    "You are an evaluator. Score how well this corporate statement " +
    "aligns with the agent's identity. Return only a single number from 0 to 10.";

  const products = (identity.products || []).join(', ');
  const competitors = (identity.competitors || []).join(', ');

  const userPrompt =
    "Agent: " + (identity.name || 'Unknown') + "\n" +
    "Industry: " + (identity.industry || 'unknown') + "\n" +
    "Products: " + products + "\n" +
    "Competitors: " + competitors + "\n" +
    "Motivation: " + (identity.motivation || 'unknown') + "\n\n" +
    "Statement: " + statement;

  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
  });

  const score = parseInt((content as string).trim());
  if (isNaN(score)) return 0;
  if (score > 10) return 10;
  if (score < 0) return 0;
  return score;
}
