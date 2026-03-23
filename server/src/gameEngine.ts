import { NUM_PHASES, ROUNDS_PER_PHASE, KILL_NUMBER } from '@shared/constants';
import { Room, RollEvent } from '@shared/types';
import { scoreRoll } from '@shared/scoring';

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Deep-clone a room so mutations don't affect the original */
function cloneRoom(room: Room): Room {
  return JSON.parse(JSON.stringify(room));
}

/** Start a game from a lobby room */
export function startGame(room: Room): Room {
  const r = cloneRoom(room);
  r.status = 'active';
  r.phase = 1;
  r.round = 1;
  r.turnIndex = 0;
  r.turnOrder = shuffle(r.players.map((p) => p.id));
  r.lastRoll = null;
  r.rollHistory = [];
  // Reset all player scores
  for (const p of r.players) {
    p.totalScore = 0;
    p.roundScore = 0;
    p.phaseScores = [0, 0, 0, 0];
    p.isIn = true;
  }
  return r;
}

/** Process a dice roll for the current turn player */
export function processRoll(room: Room): { room: Room; event: RollEvent } {
  const r = cloneRoom(room);
  const currentPlayerId = r.turnOrder[r.turnIndex];

  // Generate roll and seed
  const result = Math.floor(Math.random() * 6) + 1;
  const seed = Math.floor(Math.random() * 2_147_483_647);

  const event: RollEvent = {
    phase: r.phase,
    round: r.round,
    rollerId: currentPlayerId,
    result,
    timestamp: Date.now(),
    seed,
  };

  r.lastRoll = result;
  r.rollHistory.push(event);

  if (result === KILL_NUMBER) {
    // Kill: zero out and mark all "in" players as out
    for (const p of r.players) {
      if (p.isIn) {
        p.roundScore = 0;
        p.isIn = false;
      }
    }
  } else {
    // Find current round score from any in-player (they're all equal)
    const anyInPlayer = r.players.find((p) => p.isIn);
    const currentRoundScore = anyInPlayer ? anyInPlayer.roundScore : 0;

    const { points, isDouble } = scoreRoll(result, r.phase, currentRoundScore);

    for (const p of r.players) {
      if (p.isIn) {
        if (isDouble) {
          // Double the current round score (add currentRoundScore again)
          p.roundScore += points; // points === currentRoundScore here
        } else {
          p.roundScore += points;
        }
      }
    }

    // Advance turn (skip out/disconnected players)
    r.turnIndex = nextTurnIndex(r);
  }

  return { room: r, event };
}

/** Lock in a player's round score */
export function processGoOut(room: Room, playerId: string): Room {
  const r = cloneRoom(room);
  const player = r.players.find((p) => p.id === playerId);
  if (player && player.isIn) {
    player.isIn = false;
  }
  return r;
}

/** Advance to next turn, skipping out/disconnected players */
export function advanceTurn(room: Room): Room {
  const r = cloneRoom(room);
  r.turnIndex = nextTurnIndex(r);
  return r;
}

function nextTurnIndex(room: Room): number {
  const len = room.turnOrder.length;
  if (len === 0) return 0;

  let next = (room.turnIndex + 1) % len;
  let attempts = 0;
  while (attempts < len) {
    const playerId = room.turnOrder[next];
    const player = room.players.find((p) => p.id === playerId);
    if (player && player.isIn && player.isConnected) {
      return next;
    }
    next = (next + 1) % len;
    attempts++;
  }
  // All players are out or disconnected — return next anyway
  return (room.turnIndex + 1) % len;
}

/** Check if the current round has ended */
export function checkRoundEnd(room: Room): { ended: boolean; reason?: 'kill' | 'all_out' } {
  // Kill: last roll was the kill number
  if (room.lastRoll === KILL_NUMBER) {
    return { ended: true, reason: 'kill' };
  }
  // All out: no in-players remain
  const anyIn = room.players.some((p) => p.isIn);
  if (!anyIn) {
    return { ended: true, reason: 'all_out' };
  }
  return { ended: false };
}

/**
 * Advance to next round (or phase, or end game).
 * Call this after checkRoundEnd returns ended=true.
 */
export function advanceRound(
  room: Room
): { room: Room; phaseEnded: boolean; gameEnded: boolean } {
  const r = cloneRoom(room);

  // Bank round scores into phaseScores and totalScore
  for (const p of r.players) {
    p.phaseScores[r.phase - 1] += p.roundScore;
    p.totalScore += p.roundScore;
  }

  // Reset for next round
  for (const p of r.players) {
    p.roundScore = 0;
    p.isIn = true;
  }
  r.lastRoll = null;

  let phaseEnded = false;
  let gameEnded = false;

  if (r.round >= ROUNDS_PER_PHASE) {
    // Phase complete
    phaseEnded = true;
    r.round = 1;

    if (r.phase >= NUM_PHASES) {
      // Game over
      gameEnded = true;
      r.status = 'finished';
    } else {
      r.phase++;
      r.turnOrder = shuffle(r.players.map((p) => p.id));
      r.turnIndex = 0;
    }
  } else {
    r.round++;
    // Advance turn to next player for the new round
    r.turnIndex = (r.turnIndex + 1) % r.turnOrder.length;
  }

  return { room: r, phaseEnded, gameEnded };
}

/**
 * Determine the winner from a finished room.
 * Tie-break: highest single-round score.
 */
export function getWinner(room: Room): { winnerId: string; finalScores: Record<string, number> } {
  const finalScores: Record<string, number> = {};
  for (const p of room.players) {
    finalScores[p.id] = p.totalScore;
  }

  const sorted = [...room.players].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    // Tie-break: highest single-round score
    const aMax = Math.max(...a.phaseScores);
    const bMax = Math.max(...b.phaseScores);
    return bMax - aMax;
  });

  return { winnerId: sorted[0].id, finalScores };
}
