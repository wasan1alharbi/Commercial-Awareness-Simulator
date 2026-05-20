import { useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

export default function QuizDashboard({
  worldId,
  onActiveSessionChange,
}: {
  worldId: Id<'worlds'>;
  onActiveSessionChange?: (sessionId: Id<'quizSessions'> | null) => void;
}) {
  const [selectedArticleId, setSelectedArticleId] = useState<Id<'articles'> | null>(null);
  const [difficulty, setDifficulty] = useState('');
  const [numQuestions, setNumQuestions] = useState('');
  const [includeAgentContext, setIncludeAgentContext] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<Id<'quizSessions'> | null>(null);
  const [startError, setStartError] = useState('');

  function updateActiveSession(sessionId: Id<'quizSessions'> | null) {
    setActiveSessionId(sessionId);
    if (onActiveSessionChange) {
      onActiveSessionChange(sessionId);
    }
  }

  const convex = useConvex();
  const articles = useQuery(api.simulator.index.listArticles, { worldId });

  if (activeSessionId) {
    return <ActiveQuiz sessionId={activeSessionId} onBack={() => updateActiveSession(null)} />;
  }

  async function handleStartQuiz() {
    if (!selectedArticleId || !difficulty || !numQuestions || isStarting) return;
    setIsStarting(true);
    setStartError('');
    try {
      const result = await convex.action('simulator/index:startQuiz' as any, {
        articleId: selectedArticleId,
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
        numQuestions: Number(numQuestions) as 3 | 6 | 10,
        includeAgentContext: includeAgentContext === 'yes',
      });
      updateActiveSession(result.sessionId as Id<'quizSessions'>);
    } catch (err) {
      setStartError('Something went wrong, try again.');
    }
    setIsStarting(false);
  }

  const canStart = selectedArticleId !== null && difficulty !== '' && numQuestions !== '' && !isStarting;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="px-10 py-8">
      <div className="flex flex-col gap-6 w-full">

        {/* Article cards — horizontal scroll */}
        <div>
          <p className="font-body text-4xl font-bold text-brown-100 mb-6">
            Pick an article to live through/learn:
          </p>

          {articles === undefined && (
            <p className="text-brown-400 text-xl">Loading articles...</p>
          )}

          {articles !== undefined && articles.length === 0 && (
            <p className="text-brown-400 text-xl">
              No articles yet. Submit a business article in the Simulation tab first.
            </p>
          )}

          {articles !== undefined && articles.length > 0 && (
            <div className="flex gap-6 overflow-x-auto pb-3" style={{ scrollbarWidth: 'thin' }}>
              {articles.map((article) => {
                const isSelected = selectedArticleId === article._id;
                return (
                  <button
                    key={article._id}
                    onClick={() => setSelectedArticleId(article._id)}
                    className={
                      'flex-shrink-0 w-[40.5rem] rounded border-2 text-left transition-colors overflow-hidden ' +
                      (isSelected
                        ? 'border-blue-600 bg-brown-700'
                        : 'border-brown-600 bg-brown-800 hover:border-brown-600')
                    }
                  >
                    <div
                      className={
                        'h-[27rem] flex items-center justify-center ' +
                        (isSelected ? 'bg-blue-600/20' : 'bg-brown-700')
                      }
                    >
                      <div className="px-10 text-center max-w-prose mx-auto">
                        <p className="font-display text-4xl font-extrabold text-brown-100 leading-tight tracking-normal" style={{ textWrap: 'balance' } as any}>
                          {article.extractedCompanies.slice(0, 3).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="px-12 py-10">
                      <p className="font-body text-2xl text-brown-100 leading-loose tracking-normal" style={{ display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: '60ch', hyphens: 'auto' as any, wordBreak: 'normal' }}>
                        {article.summary}
                      </p>
                      <p className="font-body text-xl text-brown-100 font-semibold mt-6">
                        {new Date(article.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="border-t border-brown-600" />

        {/* Dropdowns */}
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-body text-2xl text-brown-200 mb-2">
              What difficulty level are you comfortable with:
            </p>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              aria-label="Difficulty level"
              className="w-full px-4 py-3 bg-brown-700 text-brown-100 border-2 border-brown-600 rounded font-body text-2xl focus:outline-none focus:border-blue-600 appearance-none cursor-pointer"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23a89070\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
              }}
            >
              <option value="">Select an option</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div>
            <p className="font-body text-2xl text-brown-200 mb-2">
              How many questions would you like:
            </p>
            <select
              value={numQuestions}
              onChange={(e) => setNumQuestions(e.target.value)}
              aria-label="Number of questions"
              className="w-full px-4 py-3 bg-brown-700 text-brown-100 border-2 border-brown-600 rounded font-body text-2xl focus:outline-none focus:border-blue-600 appearance-none cursor-pointer"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23a89070\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
              }}
            >
              <option value="">Select an option</option>
              <option value="3">3 questions</option>
              <option value="6">6 questions</option>
              <option value="10">10 questions</option>
            </select>
          </div>

          <div>
            <p className="font-body text-2xl text-brown-200 mb-2">
              Would you like the Simulation interactions to be taken into account as well?
            </p>
            <select
              value={includeAgentContext}
              onChange={(e) => setIncludeAgentContext(e.target.value)}
              aria-label="Include simulation interactions in quiz context"
              className="w-full px-4 py-3 bg-brown-700 text-brown-100 border-2 border-brown-600 rounded font-body text-2xl focus:outline-none focus:border-blue-600 appearance-none cursor-pointer"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23a89070\' stroke-width=\'2\' fill=\'none\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
              }}
            >
              <option value="">Select an option</option>
              <option value="yes">Yes, use what agents said too</option>
              <option value="no">No, just the article</option>
            </select>
          </div>
        </div>

        {/* Start button */}
        <div className="flex justify-center pt-2">
          <button
            onClick={handleStartQuiz}
            disabled={!canStart}
            className={
              'px-20 py-4 rounded font-display text-4xl transition-colors ' +
              (canStart
                ? 'bg-brown-600 text-brown-100 border-2 border-brown-600 hover:bg-brown-500'
                : 'bg-brown-700 text-brown-500 border-2 border-brown-600 cursor-not-allowed')
            }
          >
            {isStarting ? 'Generating...' : 'Start Practising'}
          </button>
        </div>

        {startError !== '' && (
          <p className="font-body text-xl text-red-400 text-center">{startError}</p>
        )}

      </div>
    </div>
  );
}

function ActiveQuiz({
  sessionId,
  onBack,
}: {
  sessionId: Id<'quizSessions'>;
  onBack: () => void;
}) {
  const session = useQuery(api.simulator.index.getQuizSessionById, { sessionId });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const convex = useConvex();

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center" style={{ flex: 1 }}>
        <p className="text-brown-400 font-body text-xl">Loading...</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ flex: 1 }}>
        <p className="text-red-400 font-body text-xl">Couldn't find that quiz session.</p>
        <button onClick={onBack} className="text-brown-400 hover:text-brown-100 text-xl font-body">
          ← Back
        </button>
      </div>
    );
  }

  const answeredIds = new Set(session.answers.map((a) => a.questionId));
  const currentQuestion = session.questions.find((q) => !answeredIds.has(q.id));
  const isCompleted = session.status === 'completed';
  const questionsAnswered = session.answers.length;
  const totalQuestions = session.numQuestions;
  const progressPercent = totalQuestions > 0 ? Math.round((questionsAnswered / totalQuestions) * 100) : 0;

  async function handleAnswer(questionId: string, selectedLabel: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await convex.action('simulator/index:submitAnswer' as any, {
        sessionId,
        questionId,
        selectedLabel,
      });
    } catch (err) {
      setSubmitError('Something went wrong, try again.');
    }
    setIsSubmitting(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* Progress bar */}
      <div className="px-5 py-3 bg-brown-800 border-b-4 border-brown-600">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-brown-400 hover:text-brown-100 text-xl font-body">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <span className="font-display text-xl text-brown-300">
              {questionsAnswered}/{totalQuestions}
            </span>
            <div className="w-32 h-2 bg-brown-700 rounded overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded transition-all"
                style={{ width: progressPercent + '%' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Question area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="px-16 py-12">
        <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}>
          {isCompleted && (
            <div className="text-center mt-8">
              <p className="font-display text-4xl text-blue-600 mb-3">Done!</p>
              <p className="font-body text-xl text-brown-300">
                All {totalQuestions} questions answered. Check your KPI scores above.
              </p>
              <button
                onClick={onBack}
                className="mt-6 px-10 py-3 rounded font-display text-3xl bg-brown-600 text-brown-100 border-2 border-brown-600 hover:bg-brown-500 transition-colors"
              >
                Start Another Quiz
              </button>
            </div>
          )}

          {!isCompleted && currentQuestion && (
            <div className="flex flex-col gap-8">
              <p className="font-display text-2xl font-bold text-brown-100 uppercase">
                Question {questionsAnswered + 1} of {totalQuestions}
              </p>
              <p className="font-body text-5xl font-bold text-brown-100 leading-snug">
                {currentQuestion.scenario}
              </p>
              <div className="flex flex-col gap-5">
                {currentQuestion.options.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => handleAnswer(currentQuestion.id, option.label)}
                    disabled={isSubmitting}
                    className={
                      'text-left px-8 py-6 rounded border-2 font-body text-3xl font-bold transition-colors flex items-start gap-5 ' +
                      (isSubmitting
                        ? 'bg-brown-800 border-brown-600 text-brown-500 cursor-not-allowed'
                        : 'bg-brown-800 border-brown-600 text-brown-100 hover:border-blue-600 hover:bg-brown-700')
                    }
                  >
                    <span className="font-display text-blue-600 text-4xl font-extrabold leading-tight flex-shrink-0">
                      {option.label}
                    </span>
                    <span className="leading-relaxed">{option.text}</span>
                  </button>
                ))}
              </div>
              {isSubmitting && (
                <p className="font-body text-xl text-blue-600 text-center animate-pulse">
                  Thinking...
                </p>
              )}
              {submitError !== '' && (
                <p className="font-body text-xl text-red-400 text-center">{submitError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
