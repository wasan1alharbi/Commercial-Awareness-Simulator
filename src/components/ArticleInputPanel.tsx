import { useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export default function ArticleInputPanel() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [successSummary, setSuccessSummary] = useState('');
  const [newSpawns, setNewSpawns] = useState<string[]>([]);
  const [alreadyHadAgents, setAlreadyHadAgents] = useState<string[]>([]);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;

  const convex = useConvex();

  const isValid = text.length >= 50;

  async function handleSubmit() {
    if (!isValid || isLoading || !worldId) {
      return;
    }

    setIsLoading(true);
    setRejectionReason('');
    setSuccessSummary('');
    setNewSpawns([]);
    setAlreadyHadAgents([]);

    try {
      const result = await convex.action('simulator/index:submitArticle' as any, { worldId: worldId, text: text });

      if (result.success === false) {
        setRejectionReason(result.rejectionReason || 'Article was rejected.');
      } else {
        setSuccessSummary(result.summary || '');
        setNewSpawns(result.newSpawns || []);
        setAlreadyHadAgents(result.alreadyHadAgents || []);
      }
    } catch (error) {
      setRejectionReason('Something went wrong. Please try again.');
    }

    setIsLoading(false);
  }

  let charCountMessage = text.length + ' characters';
  if (!isValid) {
    charCountMessage = text.length + ' characters (' + (50 - text.length) + ' more needed)';
  }

  let charCountColor = 'text-green-400';
  if (!isValid) {
    charCountColor = 'text-brown-400';
  }

  let buttonLabel = 'Submit';
  if (isLoading) {
    buttonLabel = 'Submitting...';
  }

  let buttonStyle = 'px-8 py-2 font-display text-3xl border-2 border-brown-600 text-brown-100 bg-clay-700';
  if (!isValid || isLoading) {
    buttonStyle = buttonStyle + ' opacity-50 cursor-not-allowed';
  }

  return (
    <div className="flex flex-col gap-2 px-6 py-4 bg-brown-800 border-b-4 border-brown-600">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Business news article to ingest"
        placeholder="Paste a business news article here (minimum 50 characters)..."
        rows={4}
        disabled={isLoading}
        className="w-full px-4 py-3 bg-brown-700 text-brown-100 border-2 border-brown-600 rounded font-body text-2xl placeholder-brown-400 focus:outline-none focus:border-blue-600 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className={'font-body text-xl ' + charCountColor}>
          {charCountMessage}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!isValid || isLoading}
          className={buttonStyle}
        >
          {buttonLabel}
        </button>
      </div>

      {isLoading && (
        <div className="font-body text-xl text-blue-600 text-center py-2">
          Processing article...
        </div>
      )}

      {rejectionReason !== '' && (
        <div className="font-body text-xl text-red-400 bg-red-900 border border-red-600 rounded px-4 py-2">
          Article rejected: {rejectionReason}
        </div>
      )}

      {successSummary !== '' && (
        <div className="flex flex-col gap-2">
          <div className="font-body text-xl text-green-400 bg-green-900 border border-green-600 rounded px-4 py-2">
            <div className="font-bold mb-1">
              {newSpawns.length > 0
                ? 'Article accepted'
                : alreadyHadAgents.length > 0
                  ? 'Saved — no new agents'
                  : 'Article accepted'}
            </div>
            <div>{successSummary}</div>
          </div>
          {newSpawns.length > 0 && (
            <div className="font-body text-xl text-brown-200 bg-brown-700 border border-brown-600 rounded px-4 py-2">
              <div className="font-bold mb-1 text-blue-600">New agents:</div>
              <div className="flex flex-wrap gap-2">
                {newSpawns.map((company) => (
                  <span key={'new-' + company} className="px-2 py-1 bg-brown-600 border border-brown-600 rounded text-brown-100">
                    {company}
                  </span>
                ))}
              </div>
            </div>
          )}
          {alreadyHadAgents.length > 0 && (
            <div className="font-body text-xl text-brown-200 bg-brown-700 border border-brown-600 rounded px-4 py-2">
              <div className="font-bold mb-1 text-blue-600">These companies were already in the sim:</div>
              <div className="flex flex-wrap gap-2">
                {alreadyHadAgents.map((company) => (
                  <span key={'old-' + company} className="px-2 py-1 bg-brown-600 border border-brown-600 rounded text-brown-100">
                    {company}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
