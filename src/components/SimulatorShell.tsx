import { useState } from 'react';
import Game from './Game.tsx';
import FreezeButton from './FreezeButton.tsx';
import MusicButton from './buttons/MusicButton.tsx';
import Button from './buttons/Button.tsx';
import InteractButton from './buttons/InteractButton.tsx';
import ReactModal from 'react-modal';
import helpImg from '../../assets/help.svg';
import { MAX_HUMAN_PLAYERS } from '../../convex/constants.ts';

export default function SimulatorShell() {
  const [activeTab, setActiveTab] = useState('simulation');
  const [sidebarTab, setSidebarTab] = useState('live');
  const [helpOpen, setHelpOpen] = useState(false);

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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh' }} className="bg-brown-900">

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
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

          <div className="flex items-center gap-3 px-6 py-6 bg-brown-800 border-b-4 border-brown-900">
            <input
              type="text"
              placeholder="Paste a business news article here..."
              className="flex-1 px-4 py-4 bg-brown-700 text-white border-2 border-brown-600 rounded font-body text-lg placeholder-brown-400 focus:outline-none focus:border-yellow-400"
              disabled
            />
            <button
              className="px-8 py-4 bg-clay-700 text-white font-display text-lg border-2 border-brown-600 opacity-50 cursor-not-allowed"
              disabled
            >
              Submit
            </button>
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <Game />
            </div>

            <div style={{ width: '30%', flexShrink: 0, display: 'flex', flexDirection: 'column' }} className="bg-brown-800 border-l-8 border-brown-900 text-brown-100">

              <div className="flex border-b-4 border-brown-900">
                <button onClick={showLiveTab} className={sidebarTab === 'live' ? sidebarTabActiveStyle : sidebarTabStyle}>
                  Live Interactions
                </button>
                <button onClick={showHistoryTab} className={sidebarTab === 'history' ? sidebarTabActiveStyle : sidebarTabStyle}>
                  History
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }} className="p-4">
                {sidebarTab === 'live' && (
                  <p className="text-brown-400 text-sm text-center mt-8">
                    Live agent interactions will appear here once an article is submitted.
                  </p>
                )}
                {sidebarTab === 'history' && (
                  <p className="text-brown-400 text-sm text-center mt-8">
                    Past conversations will appear here.
                  </p>
                )}
              </div>

              <div className="p-3 border-t-4 border-brown-900">
                <input
                  type="text"
                  placeholder="Ask about past interactions..."
                  className="w-full px-3 py-2 bg-brown-700 text-white text-sm border-2 border-brown-600 rounded placeholder-brown-400 focus:outline-none focus:border-yellow-400"
                  disabled
                />
              </div>

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
