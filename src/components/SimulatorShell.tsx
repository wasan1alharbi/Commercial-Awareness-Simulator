import { useRef, useState } from 'react';
import { useConvex, useQuery } from 'convex/react';
import Game from './Game.tsx';
import ArticleInputPanel from './ArticleInputPanel.tsx';
import FreezeButton from './FreezeButton.tsx';
import MusicButton from './buttons/MusicButton.tsx';
import Button from './buttons/Button.tsx';
import InteractButton from './buttons/InteractButton.tsx';
import ReactModal from 'react-modal';
import helpImg from '../../assets/help.svg';
import { MAX_HUMAN_PLAYERS } from '../../convex/constants.ts';
import { GameId } from '../../convex/aiTown/ids.ts';
import { api } from '../../convex/_generated/api';
import { ServerGame, useServerGame } from '../hooks/serverGame.ts';
import PlayerDetails from './PlayerDetails.tsx';
import { Id } from '../../convex/_generated/dataModel';

export default function SimulatorShell() {
  const [activeTab, setActiveTab] = useState('simulation');
  const [sidebarTab, setSidebarTab] = useState('live');
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ kind: 'player'; id: GameId<'players'> }>();
  const [askQuestion, setAskQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [followUpContext, setFollowUpContext] = useState('');

  const convex = useConvex();

  function handleSelectElement(element?: { kind: 'player'; id: GameId<'players'> }) {
    setSelectedElement(element);
    if (element) {
      setSidebarTab('chats');
    }
  }
  function handleFollowUp(question: string, answer: string) {
    setFollowUpContext('Previous Q&A:\nQ: ' + question + '\nA: ' + answer);
    setAskQuestion('');
    setSidebarTab('history');
  }

  const scrollViewRef = useRef<HTMLDivElement>(null);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;
  const game = useServerGame(worldId);

  function showSimulation() {
    setActiveTab('simulation');
  }

  function showPractice() {
    setActiveTab('practice');
  }

  function showLiveTab() {
    setSidebarTab('live');
  }

  function showHistoryTab() {
    setSidebarTab('history');
  }

  const navTabStyle = 'px-6 py-2 font-display text-2xl text-brown-300 hover:text-white';
  const navTabActiveStyle = 'px-6 py-2 font-display text-2xl text-yellow-400 underline';

  const sidebarTabStyle = 'flex-1 py-2 font-display text-sm text-brown-400 hover:text-white';
  const sidebarTabActiveStyle = 'flex-1 py-2 font-display text-sm bg-brown-700 text-white';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', overflow: 'hidden' }} className="bg-brown-900">

      <ReactModal
        isOpen={helpOpen}
        onRequestClose={() => setHelpOpen(false)}
        style={helpModalStyles}
        contentLabel="Help modal"
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-6xl font-bold font-display game-title">Help</h1>
          <p>Welcome to the Commercial Awareness Simulator.</p>
          <h2 className="text-4xl mt-4">Simulation Tab</h2>
          <p>Paste a real business news article and watch AI company agents react to it in real time.</p>
          <h2 className="text-4xl mt-4">Controls</h2>
          <p className="mt-4">Click and drag to move around the map, scroll to zoom.</p>
          <p className="mt-4">Click on an agent to see their conversation history.</p>
          <p className="mt-4">Only {MAX_HUMAN_PLAYERS} human players allowed at a time.</p>
        </div>
      </ReactModal>

      <nav className="flex items-center px-8 py-8 bg-brown-800 border-b-4 border-brown-900">
        <span className="text-white font-display text-4xl mr-10">Commercial Awareness</span>
        <button onClick={showSimulation} className={activeTab === 'simulation' ? navTabActiveStyle : navTabStyle}>
          Simulation
        </button>
        <span className="text-brown-500 mx-3 text-2xl">|</span>
        <button onClick={showPractice} className={activeTab === 'practice' ? navTabActiveStyle : navTabStyle}>
          Practice Session
        </button>
      </nav>

      {activeTab === 'simulation' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          <ArticleInputPanel />

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <Game setSelectedElement={handleSelectElement} />
            </div>

            <div style={{ width: '30%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} className="bg-brown-800 border-l-8 border-brown-900 text-brown-100">

              <div className="flex border-b-4 border-brown-900">
                <button onClick={showLiveTab} className={sidebarTab === 'live' ? sidebarTabActiveStyle : sidebarTabStyle}>
                  Live Interactions
                </button>
                <button onClick={showHistoryTab} className={sidebarTab === 'history' ? sidebarTabActiveStyle : sidebarTabStyle}>
                  History
                </button>
                <button onClick={() => setSidebarTab('chats')} className={sidebarTab === 'chats' ? sidebarTabActiveStyle : sidebarTabStyle}>
                  Private Company Chats
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }} className="p-4" ref={scrollViewRef}>
                {selectedElement && worldId && engineId && game && sidebarTab === 'chats' ? (
                  <PlayerDetails
                    worldId={worldId}
                    engineId={engineId}
                    game={game}
                    playerId={selectedElement.id}
                    setSelectedElement={handleSelectElement}
                    scrollViewRef={scrollViewRef}
                  />
                ) : (
                  <>
                    {sidebarTab === 'live' && (
                      <LiveTab game={game} />
                    )}
                    {sidebarTab === 'history' && worldId && (
                      <HistoryTab worldId={worldId} onFollowUp={handleFollowUp} />
                    )}
                    {sidebarTab === 'history' && !worldId && (
                      <p className="text-brown-400 text-sm text-center mt-8">
                        Loading...
                      </p>
                    )}
                    {sidebarTab === 'chats' && (
                      <p className="text-brown-400 text-sm text-center mt-8">
                        Private company chats will appear here.
                      </p>
                    )}
                  </>
                )}
              </div>

              <form
                className="p-3 border-t-4 border-brown-900"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (askQuestion.trim() === '' || !worldId || askLoading) return;

                  let context = '';
                  if (followUpContext) {
                    context = followUpContext;
                  } else if (sidebarTab === 'live' && game) {
                    const summary = game.world.currentArticleSummary || '';
                    const statements = game.world.publicStatements || [];
                    const stmtLines = statements.map(
                      (s: { agentName: string; statement: string }) => s.agentName + ': ' + s.statement,
                    );
                    context = summary + '\n' + stmtLines.join('\n');
                  } else {
                    context = 'User was browsing the sidebar.';
                  }

                  setAskLoading(true);
                  try {
                    await convex.mutation('simulator/index:submitAskQuestion' as any, {
                      worldId,
                      question: askQuestion.trim(),
                      context: context.trim(),
                    });
                    setAskQuestion('');
                    setFollowUpContext('');
                    setSidebarTab('history');
                  } catch (err) {
                    console.error('Failed to submit question:', err);
                  }
                  setAskLoading(false);
                }}
              >
                <input
                  type="text"
                  placeholder={askLoading ? 'Submitting...' : followUpContext ? 'Ask a follow-up...' : 'Ask about past interactions...'}
                  className="w-full px-3 py-2 bg-brown-700 text-white text-sm border-2 border-brown-600 rounded placeholder-brown-400 focus:outline-none focus:border-yellow-400"
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  disabled={askLoading}
                />
              </form>

            </div>
          </div>
        </div>
      )}

      {activeTab === 'practice' && (
        <div className="flex items-center justify-center flex-1 text-brown-100 font-display text-2xl">
          Practice Session — coming soon
        </div>
      )}

      <footer className="flex items-center gap-3 px-6 py-3 bg-brown-800 border-t-4 border-brown-900 flex-wrap">
        <div className="flex gap-4 pointer-events-auto">
          <FreezeButton />
          <MusicButton />
          <InteractButton />
          <Button imgUrl={helpImg} onClick={() => setHelpOpen(true)}>Help</Button>
        </div>
      </footer>

    </div>
  );
}

function LiveTab({ game }: { game: ServerGame | undefined }) {
  if (!game) {
    return (
      <p className="text-brown-400 text-sm text-center mt-8">
        Loading world data...
      </p>
    );
  }

  const articleSummary = game.world.currentArticleSummary;
  const publicStatements = game.world.publicStatements;

  if (!articleSummary) {
    return (
      <p className="text-brown-400 text-sm text-center mt-8">
        Submit a business article above to see the live broadcast and agent reactions here.
      </p>
    );
  }

  const sortedStatements = [...publicStatements].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-brown-700 rounded px-3 py-3 border-l-4 border-yellow-400">
        <span className="font-display text-xs text-yellow-400 uppercase tracking-wide">Broadcast</span>
        <p className="text-brown-100 text-sm mt-1">{articleSummary}</p>
      </div>

      {sortedStatements.length > 0 && (
        <div>
          <span className="font-display text-xs text-brown-400 uppercase tracking-wide">Agent Reactions</span>
          <ul className="flex flex-col gap-2 mt-2">
            {sortedStatements.map((stmt, i) => (
              <li key={`${stmt.agentName}-${i}`} className="bg-brown-700 rounded px-3 py-2 text-sm">
                <span className="text-yellow-300 font-display text-xs">{stmt.agentName}</span>
                <p className="text-brown-100 mt-1">{stmt.statement}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sortedStatements.length === 0 && (
        <p className="text-brown-400 text-sm text-center">
          Agents are processing the article... reactions will appear shortly.
        </p>
      )}
    </div>
  );
}

function HistoryTab({ worldId, onFollowUp }: { worldId: Id<'worlds'>; onFollowUp: (question: string, answer: string) => void }) {
  const chats = useQuery(api.simulator.index.listAskChats, { worldId });

  if (chats === undefined) {
    return (
      <p className="text-brown-400 text-sm text-center mt-8">
        Loading...
      </p>
    );
  }

  if (chats.length === 0) {
    return (
      <p className="text-brown-400 text-sm text-center mt-8">
        No questions asked yet. Use the input below to ask about agent interactions.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {chats.map((chat) => {
        const timeLabel = new Date(chat.createdAt).toLocaleString();
        return (
          <div
            key={chat._id}
            className="flex flex-col gap-2"
            style={{ cursor: chat.answer ? 'pointer' : 'default' }}
            onClick={() => {
              if (chat.answer) {
                onFollowUp(chat.question, chat.answer);
              }
            }}
            onMouseEnter={(e) => {
              if (chat.answer) {
                e.currentTarget.style.opacity = '0.8';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <div className="leading-tight">
              <div className="flex gap-4 justify-end">
                <span className="uppercase text-xs text-brown-400">You</span>
                <time className="text-xs text-brown-400" dateTime={chat.createdAt.toString()}>
                  {timeLabel}
                </time>
              </div>
              <div className="bubble bubble-mine">
                <p className="bg-white -mx-3 -my-1 text-black text-sm">{chat.question}</p>
              </div>
            </div>

            <div className="leading-tight">
              <div className="flex gap-4">
                <span className="uppercase text-xs text-brown-400">Assistant</span>
              </div>
              {chat.answer ? (
                <div className="bubble">
                  <p className="bg-white -mx-3 -my-1 text-black text-sm">{chat.answer}</p>
                </div>
              ) : (
                <div className="bubble">
                  <p className="bg-white -mx-3 -my-1 text-black text-sm">
                    <i>Thinking...</i>
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const helpModalStyles = {
  overlay: { backgroundColor: 'rgb(0, 0, 0, 75%)', zIndex: 12 },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
