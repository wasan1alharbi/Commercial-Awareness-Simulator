import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import PixiGame from './PixiGame.tsx';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game({
  setSelectedElement,
}: {
  setSelectedElement: (element?: { kind: 'player'; id: GameId<'players'> }) => void;
}) {
  const convex = useConvex();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  if (!worldId || !engineId || !game) {
    return null;
  }

  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="relative overflow-hidden bg-brown-900 w-full h-full" ref={gameWrapperRef}>
        <div className="absolute inset-0">
          <div className="container">
            <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
              <ConvexProvider client={convex}>

                <PixiGame
                  game={game}
                  worldId={worldId}
                  engineId={engineId}
                  width={width}
                  height={height}
                  historicalTime={historicalTime}
                  setSelectedElement={setSelectedElement}
                />
              </ConvexProvider>
            </Stage>
          </div>
        </div>
      </div>
    </>
  );
}
