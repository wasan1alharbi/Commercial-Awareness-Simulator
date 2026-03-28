import { v } from 'convex/values';
import { internalAction, internalQuery } from '../_generated/server';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';
import { chatCompletion } from '../util/llm';

export const getPlayerNames = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results: { id: string; name: string }[] = [];
    for (const pid of args.playerIds) {
      const desc = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', pid))
        .unique();
      if (desc) {
        results.push({ id: pid, name: desc.name });
      }
    }
    return results;
  },
});

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
    );
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    const text = await completionFn(
      ctx,
      args.worldId,
      args.conversationId as GameId<'conversations'>,
      args.playerId as GameId<'players'>,
      args.otherPlayerId as GameId<'players'>,
    );

    await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave',
      operationId: args.operationId,
    });
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
    goals: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { player, agent } = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    if (!player.pathfinding) {
      if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            activity: {
              description: activity.description,
              emoji: activity.emoji,
              until: Date.now() + activity.duration,
            },
          },
        });
        return;
      }
    }

    let invitee: string | undefined = undefined;

    if (!justLeftConversation && !recentlyAttemptedInvite) {
      const goals = args.goals ?? [];
      if (goals.length > 0 && args.otherFreePlayers.length > 0) {
        invitee = await pickGoalDrivenTarget(ctx, args.worldId, goals, args.otherFreePlayers);
      }
      if (!invitee) {
        invitee = await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
          now,
          worldId: args.worldId,
          player: args.player,
          otherFreePlayers: args.otherFreePlayers,
        });
      }
    }

    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}

async function pickGoalDrivenTarget(ctx: { runQuery: (ref: any, args: any) => Promise<any> }, worldId: string, goals: string[], otherFreePlayers: { id: string }[]) {
  // get the names of all the free players so we can show them to the LLM
  const playerNames: { id: string; name: string }[] = await ctx.runQuery(internal.aiTown.agentOperations.getPlayerNames, {
    worldId,
    playerIds: otherFreePlayers.map((p) => p.id),
  });

  if (playerNames.length === 0) {
    return undefined;
  }

  const goalsText = goals.join('\n');
  const playerListText = playerNames.map((p) => p.name).join(', ');

  const systemPrompt =
    'You are helping a company agent decide who to talk to next based on their goals. ' +
    'Reply with only the name of the most relevant player from the list, nothing else.';

  const userPrompt =
    'Agent goals:\n' +
    goalsText +
    '\n\nAvailable players: ' +
    playerListText +
    '\n\nWhich player is most relevant to these goals? Reply with just the name.';

  try {
    const result = await chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 50,
      temperature: 0,
    });

    const chosenName = result.content.trim();

    // loop through the players and find the one the LLM picked
    let matchedPlayer = undefined;
    for (const p of playerNames) {
      if (p.name.toLowerCase() === chosenName.toLowerCase()) {
        matchedPlayer = p;
      }
    }

    if (matchedPlayer === null || matchedPlayer === undefined) {
      return undefined;
    }

    return matchedPlayer.id;
  } catch (e) {
    // console.log("goal-driven target failed, falling back", e);
    return undefined;
  }
}
