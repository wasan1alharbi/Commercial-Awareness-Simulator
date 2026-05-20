import { buildAskContext } from './askContext';

describe('buildAskContext', () => {

  test('article and public statements only', () => {
    const ctx = buildAskContext({
      articleSummary: 'Apple acquired Anthropic for $50B.',
      publicStatements: [
        { agentName: 'Apple',     statement: 'Excited to integrate Claude.' },
        { agentName: 'Microsoft', statement: 'Watching closely.' },
      ],
    });
    expect(ctx).toContain('Current article: Apple acquired Anthropic for $50B.');
    expect(ctx).toContain('Agent positions:');
    expect(ctx).toContain('Apple: Excited to integrate Claude.');
    expect(ctx).toContain('Microsoft: Watching closely.');
    expect(ctx).not.toContain('Live conversation');
    expect(ctx).not.toContain('Previous conversation');
  });

  test('with conversation messages', () => {
    const ctx = buildAskContext({
      articleSummary: 'Apple acquired Anthropic.',
      publicStatements: [],
      conversationMessages: [
        { authorName: 'Apple',  text: 'We should rethink our AI pipeline.' },
        { authorName: 'Google', text: 'We just shipped Gemini 2.' },
      ],
    });
    expect(ctx).toContain('Live conversation you are reading:');
    expect(ctx).toContain('Apple: We should rethink our AI pipeline.');
    expect(ctx).toContain('Google: We just shipped Gemini 2.');
    expect(ctx).toContain('Current article: Apple acquired Anthropic.');
  });

  test('with thread history', () => {
    const ctx = buildAskContext({
      articleSummary: 'Apple acquired Anthropic.',
      publicStatements: [],
      threadHistory: [
        { question: 'Who is involved?', answer: 'Apple and Anthropic.' },
        { question: 'How much?',        answer: '$50 billion.' },
      ],
    });
    expect(ctx).toContain('Previous conversation:');
    expect(ctx).toContain('Q: Who is involved?');
    expect(ctx).toContain('A: Apple and Anthropic.');
    expect(ctx).toContain('Q: How much?');
  });

  test('pending answer in thread', () => {
    const ctx = buildAskContext({
      articleSummary: 'X',
      publicStatements: [],
      threadHistory: [{ question: 'Still loading?', answer: undefined }],
    });
    expect(ctx).toContain('A: (pending)');
  });

  test('empty world fallback', () => {
    const ctx = buildAskContext({
      articleSummary: '',
      publicStatements: [],
    });
    expect(ctx).toContain('No active simulation yet');
  });

  test('fitbit whoop scenario', () => {
    // shape matches what listMessages returns
    const listMessagesOutput = [
      { _id: 'm1', authorName: 'Fitbit', text: 'I enjoyed our discussion about the competitive landscape in health technology.' },
      { _id: 'm2', authorName: 'Whoop',  text: 'Trends like real-time recovery data and strain tracking are crucial for our users.' },
      { _id: 'm3', authorName: 'Fitbit', text: "We're enhancing features like the Advanced Sleep Score." },
    ];
    const conversationMessages = listMessagesOutput.map(m => ({ authorName: m.authorName, text: m.text }));

    const ctx = buildAskContext({
      articleSummary: 'Apple-Google patent truce reshapes wearables market.',
      publicStatements: [{ agentName: 'Fitbit', statement: 'Committed to AI-driven insights.' }],
      conversationMessages,
    });

    expect(ctx).toContain('Live conversation you are reading:');
    expect(ctx).toContain('Fitbit: I enjoyed our discussion about the competitive landscape in health technology.');
    expect(ctx).toContain('Whoop: Trends like real-time recovery data and strain tracking are crucial for our users.');
    expect(ctx).toContain("Fitbit: We're enhancing features like the Advanced Sleep Score.");
    expect(ctx).toContain('Current article: Apple-Google patent truce reshapes wearables market.');
  });

  test('no open conversation', () => {
    const ctx = buildAskContext({
      articleSummary: 'Article.',
      publicStatements: [{ agentName: 'X', statement: 'pos' }],
      conversationMessages: undefined,
    });
    expect(ctx).not.toContain('Live conversation you are reading:');
    expect(ctx).toContain('Current article: Article.');
    expect(ctx).toContain('X: pos');
  });

  test('empty conversation messages array', () => {
    const ctx = buildAskContext({
      articleSummary: 'Article.',
      publicStatements: [],
      conversationMessages: [],
    });
    expect(ctx).not.toContain('Live conversation you are reading:');
  });

  test('conversation and thread together', () => {
    const ctx = buildAskContext({
      articleSummary: 'Article.',
      publicStatements: [],
      conversationMessages: [{ authorName: 'A', text: 'm1' }],
      threadHistory: [{ question: 'q1', answer: 'a1' }],
    });
    expect(ctx).toContain('Live conversation you are reading:');
    expect(ctx).toContain('Previous conversation:');
    const wIdx = ctx.indexOf('Current article');
    const cIdx = ctx.indexOf('Live conversation');
    const tIdx = ctx.indexOf('Previous conversation');
    expect(wIdx).toBeLessThan(cIdx);
    expect(cIdx).toBeLessThan(tIdx);
  });
});
