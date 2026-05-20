// builds the context string passed to submitAskQuestion

export type PublicStatement = { agentName: string; statement: string };
export type ConversationMessage = { authorName: string; text: string };
export type AskThreadEntry = { question: string; answer?: string };

export type AskContextInputs = {
  articleSummary: string;
  publicStatements: PublicStatement[];
  conversationMessages?: ConversationMessage[];
  threadHistory?: AskThreadEntry[];
};

export function buildAskContext(inputs: AskContextInputs): string {
  const { articleSummary, publicStatements, conversationMessages, threadHistory } = inputs;

  const worldParts: string[] = [];
  if (articleSummary) worldParts.push(`Current article: ${articleSummary}`);
  if (publicStatements.length) {
    const lines = publicStatements.map(s => `${s.agentName}: ${s.statement}`).join('\n');
    worldParts.push(`Agent positions:\n${lines}`);
  }
  const worldContext = worldParts.length
    ? worldParts.join('\n\n')
    : 'No active simulation yet: no article has been submitted to this world. You need to submit a business article in order to ask questions about agent interactions.';

  const sections: string[] = [worldContext];

  if (conversationMessages && conversationMessages.length) {
    const lines = conversationMessages.map(m => `${m.authorName}: ${m.text}`).join('\n');
    sections.push(`Live conversation you are reading:\n${lines}`);
  }

  if (threadHistory && threadHistory.length) {
    const lines = threadHistory.map(t => `Q: ${t.question}\nA: ${t.answer ?? '(pending)'}`).join('\n\n');
    sections.push(`Previous conversation:\n${lines}`);
  }

  return sections.join('\n\n');
}
