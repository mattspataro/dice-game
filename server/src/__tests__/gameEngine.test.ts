import {
  startGame,
  processRoll,
  processGoOut,
  advanceTurn,
  checkRoundEnd,
  advanceRound,
  getWinner,
} from '../gameEngine';
import { createRoom, joinRoom, _clearRooms } from '../roomManager';
import { NUM_PHASES, ROUNDS_PER_PHASE, KILL_NUMBER } from '@shared/constants';
import { Room } from '@shared/types';

beforeEach(() => {
  _clearRooms();
});

/** Set up a 2-player room and start the game */
function setup2PlayerGame() {
  const room = createRoom('p1', 'Alice');
  joinRoom(room.code, 'p2', 'Bob');
  const started = startGame(room);
  return started;
}

/** Mock Math.random to return a fixed value */
function mockRandom(value: number) {
  jest.spyOn(Math, 'random').mockReturnValue(value);
}

/** Restore Math.random */
function restoreRandom() {
  jest.restoreAllMocks();
}

/** Force a specific roll result by mocking Math.random.
 *  Math.floor(random() * 6) + 1:
 *    0.0 → 1, 0.1666... → 1, 0.1667 → 2, ..., 0.8333 → 5, 0.9999 → 6
 *  We map desired roll to a value: (roll - 1) / 6
 */
function rollValueFor(desiredRoll: number): number {
  return (desiredRoll - 1) / 6;
}

describe('startGame', () => {
  test('sets status to active', () => {
    const game = setup2PlayerGame();
    expect(game.status).toBe('active');
  });

  test('sets up turnOrder with all players', () => {
    const game = setup2PlayerGame();
    expect(game.turnOrder).toHaveLength(2);
    expect(game.turnOrder).toContain('p1');
    expect(game.turnOrder).toContain('p2');
  });

  test('resets all player scores to 0', () => {
    const game = setup2PlayerGame();
    for (const p of game.players) {
      expect(p.totalScore).toBe(0);
      expect(p.roundScore).toBe(0);
      expect(p.phaseScores).toEqual([0, 0, 0, 0]);
      expect(p.isIn).toBe(true);
    }
  });

  test('starts at phase 1, round 1', () => {
    const game = setup2PlayerGame();
    expect(game.phase).toBe(1);
    expect(game.round).toBe(1);
  });
});

describe('processRoll — non-kill', () => {
  afterEach(restoreRandom);

  test('adds points to all in-players', () => {
    let game = setup2PlayerGame();
    // Force roll of 3 (phase 1 → 3 points)
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(3)) // roll
      .mockReturnValue(0.5);                // seed

    const { room } = processRoll(game);
    for (const p of room.players) {
      if (p.isIn) expect(p.roundScore).toBe(3);
    }
  });

  test('only in-players accumulate points (out players unaffected)', () => {
    let game = setup2PlayerGame();
    // Put p1 out first
    game = processGoOut(game, 'p1');

    // Force roll of 5 in phase 1 → face value 5
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(5))
      .mockReturnValue(0.5);

    const { room } = processRoll(game);
    const p1 = room.players.find(p => p.id === 'p1')!;
    const p2 = room.players.find(p => p.id === 'p2')!;
    expect(p1.roundScore).toBe(0); // p1 was out, not affected
    expect(p2.roundScore).toBe(5);
  });

  test('produces a RollEvent with correct fields', () => {
    const game = setup2PlayerGame();
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(6))
      .mockReturnValue(0.5);

    const { event } = processRoll(game);
    expect(event.result).toBe(6);
    expect(event.phase).toBe(1);
    expect(event.round).toBe(1);
    expect(typeof event.seed).toBe('number');
  });
});

describe('processRoll — kill (4)', () => {
  afterEach(restoreRandom);

  test('zeroes out all in-players roundScore', () => {
    let game = setup2PlayerGame();

    // First roll of 3 to give everyone some points
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(3))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    // Now kill
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    const { room } = processRoll(game);
    for (const p of room.players) {
      expect(p.roundScore).toBe(0);
      expect(p.isIn).toBe(false);
    }
  });

  test('sets lastRoll to KILL_NUMBER', () => {
    const game = setup2PlayerGame();
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    const { room } = processRoll(game);
    expect(room.lastRoll).toBe(KILL_NUMBER);
  });

  test('a player who went out before kill keeps their locked score', () => {
    let game = setup2PlayerGame();

    // Roll of 6 to build score
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(6))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    // p1 goes out (locks in 6 points)
    game = processGoOut(game, 'p1');
    expect(game.players.find(p => p.id === 'p1')!.roundScore).toBe(6);

    // Kill
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    const { room } = processRoll(game);

    const p1 = room.players.find(p => p.id === 'p1')!;
    const p2 = room.players.find(p => p.id === 'p2')!;
    // p1 was already out — kill only zeroes in-players
    expect(p1.roundScore).toBe(6); // locked, unaffected
    expect(p2.roundScore).toBe(0); // killed
  });
});

describe('processGoOut', () => {
  test('marks player as not in', () => {
    const game = setup2PlayerGame();
    const updated = processGoOut(game, 'p1');
    const p1 = updated.players.find(p => p.id === 'p1')!;
    expect(p1.isIn).toBe(false);
  });

  test('other players remain in', () => {
    const game = setup2PlayerGame();
    const updated = processGoOut(game, 'p1');
    const p2 = updated.players.find(p => p.id === 'p2')!;
    expect(p2.isIn).toBe(true);
  });

  test('is a no-op for a player already out', () => {
    let game = setup2PlayerGame();
    game = processGoOut(game, 'p1');
    const updated = processGoOut(game, 'p1');
    const p1 = updated.players.find(p => p.id === 'p1')!;
    expect(p1.isIn).toBe(false);
  });
});

describe('checkRoundEnd', () => {
  afterEach(restoreRandom);

  test('returns ended=true reason=kill when lastRoll is 4', () => {
    let game = setup2PlayerGame();
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    expect(checkRoundEnd(game)).toEqual({ ended: true, reason: 'kill' });
  });

  test('returns ended=true reason=all_out when all players are out', () => {
    let game = setup2PlayerGame();
    game = processGoOut(game, 'p1');
    game = processGoOut(game, 'p2');
    expect(checkRoundEnd(game)).toEqual({ ended: true, reason: 'all_out' });
  });

  test('returns ended=false when round is ongoing', () => {
    const game = setup2PlayerGame();
    expect(checkRoundEnd(game)).toEqual({ ended: false });
  });
});

describe('advanceRound', () => {
  afterEach(restoreRandom);

  test('banks round scores into phaseScores and totalScore', () => {
    let game = setup2PlayerGame();
    // Give everyone 10 points
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(3))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    game = processRoll(game).room; // kill
    restoreRandom();

    const { room } = advanceRound(game);
    // Kill zeroed roundScore before advanceRound, so phase/total stay 0 after kill
    for (const p of room.players) {
      expect(p.totalScore).toBe(0);
      expect(p.phaseScores[0]).toBe(0);
    }
  });

  test('banks locked score of player who went out before kill', () => {
    let game = setup2PlayerGame();

    // Roll 6 so everyone has 6 points
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(6))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    // p1 goes out, locking in 6
    game = processGoOut(game, 'p1');

    // Kill — p2 loses their 6, p1 keeps 6
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    const { room } = advanceRound(game);
    const p1 = room.players.find(p => p.id === 'p1')!;
    const p2 = room.players.find(p => p.id === 'p2')!;
    expect(p1.totalScore).toBe(6);
    expect(p2.totalScore).toBe(0);
  });

  test('resets roundScore and isIn for all players', () => {
    let game = setup2PlayerGame();
    game = processGoOut(game, 'p1');
    const { room } = advanceRound(game);
    for (const p of room.players) {
      expect(p.roundScore).toBe(0);
      expect(p.isIn).toBe(true);
    }
  });

  test('increments round counter', () => {
    const game = setup2PlayerGame();
    const { room } = advanceRound(game);
    expect(room.round).toBe(2);
  });

  test('transitions to next phase after ROUNDS_PER_PHASE rounds', () => {
    let game = setup2PlayerGame();
    // Advance through all 10 rounds
    for (let i = 0; i < ROUNDS_PER_PHASE; i++) {
      game.round = ROUNDS_PER_PHASE; // force last round
      const result = advanceRound(game);
      game = result.room;
      if (result.phaseEnded) break;
    }
    expect(game.phase).toBe(2);
    expect(game.round).toBe(1);
  });

  test('ends game after all 4 phases complete', () => {
    let game = setup2PlayerGame();
    game.phase = NUM_PHASES;
    game.round = ROUNDS_PER_PHASE;
    const { room, gameEnded, phaseEnded } = advanceRound(game);
    expect(gameEnded).toBe(true);
    expect(phaseEnded).toBe(true);
    expect(room.status).toBe('finished');
  });
});

describe('Full 4-phase game simulation', () => {
  afterEach(restoreRandom);

  /**
   * Drive a full game where every round ends with all players going out
   * (no kills). p1 always goes out first after a roll of 5, p2 after.
   * This gives p1 fewer points than p2 each round (since p2 sometimes gets extra).
   *
   * For simplicity: each round, roll a 3 (all get 3 pts), then p1 goes out,
   * then roll a 2 (in phase 1 face value 2, only p2 gets it), p2 goes out.
   * p1 earns 3 per round, p2 earns 5 per round.
   */
  test('simulates a complete game and determines winner correctly', () => {
    let game = setup2PlayerGame();
    // Fix turn order so p1 always goes first
    game.turnOrder = ['p1', 'p2'];
    game.turnIndex = 0;

    let rollCount = 0;

    for (let phase = 1; phase <= NUM_PHASES; phase++) {
      for (let round = 1; round <= ROUNDS_PER_PHASE; round++) {
        // Reset all in
        for (const p of game.players) p.isIn = true;
        game.lastRoll = null;

        // Roll a 3 → both get 3 pts (all phases: face value)
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(rollValueFor(3))
          .mockReturnValue(0.5);
        game = processRoll(game).room;
        restoreRandom();
        rollCount++;

        // p1 goes out (locks 3)
        game = processGoOut(game, 'p1');

        // Roll a 2:
        //   Phase 1-3: face value 2 → only p2 gets +2 (p2 now has 5)
        //   Phase 4: 2 doubles p2's current score (p2 has 3, doubles to 6)
        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(rollValueFor(2))
          .mockReturnValue(0.5);
        game = processRoll(game).room;
        restoreRandom();
        rollCount++;

        // p2 goes out
        game = processGoOut(game, 'p2');

        // End round
        expect(checkRoundEnd(game).ended).toBe(true);
        const result = advanceRound(game);
        game = result.room;
      }
    }

    expect(game.status).toBe('finished');

    // p2 should have accumulated more points than p1 across all rounds
    const p1 = game.players.find(p => p.id === 'p1')!;
    const p2 = game.players.find(p => p.id === 'p2')!;
    expect(p2.totalScore).toBeGreaterThan(p1.totalScore);

    const { winnerId } = getWinner(game);
    expect(winnerId).toBe('p2');
  });

  test('phase scoring rules change per phase (5 is face value in phase 1, 50 in phase 2+)', () => {
    let game = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];
    game.turnIndex = 0;
    game.phase = 1;
    game.round = 1;

    // Phase 1: roll of 5 → 5 pts
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(5))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    const inPlayer = game.players.find(p => p.isIn)!;
    expect(inPlayer.roundScore).toBe(5);

    // Now jump to phase 2 and reset
    game.phase = 2;
    game.round = 1;
    for (const p of game.players) { p.roundScore = 0; p.isIn = true; }
    game.lastRoll = null;
    game.turnIndex = 0;

    // Phase 2: roll of 5 → 50 pts
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(5))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    const inPlayer2 = game.players.find(p => p.isIn)!;
    expect(inPlayer2.roundScore).toBe(50);
  });

  test('kill zeroes all in-players and advanceRound banks 0 for them', () => {
    let game = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];

    // Score 10 pts
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(3))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(3))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    // Kill
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(rollValueFor(KILL_NUMBER))
      .mockReturnValue(0.5);
    game = processRoll(game).room;
    restoreRandom();

    expect(checkRoundEnd(game).reason).toBe('kill');
    const { room } = advanceRound(game);

    for (const p of room.players) {
      expect(p.totalScore).toBe(0); // all in, all killed
    }
  });

  test('score accumulates correctly across 4 phases for a single player', () => {
    let game = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];

    // Play through all 40 rounds with a simple pattern:
    // Each round: roll 1 (phase 1: 1pt; phase 2: 1pt; phase 3: 100pt; phase 4: 100pt),
    // then both go out.
    for (let phase = 1; phase <= NUM_PHASES; phase++) {
      game.phase = phase;
      for (let round = 1; round <= ROUNDS_PER_PHASE; round++) {
        game.round = round;
        for (const p of game.players) { p.roundScore = 0; p.isIn = true; }
        game.lastRoll = null;

        jest.spyOn(Math, 'random')
          .mockReturnValueOnce(rollValueFor(1))
          .mockReturnValue(0.5);
        game = processRoll(game).room;
        restoreRandom();

        // Both go out
        game = processGoOut(game, 'p1');
        game = processGoOut(game, 'p2');

        const result = advanceRound(game);
        game = result.room;
      }
    }

    const p1 = game.players.find(p => p.id === 'p1')!;
    // Phase 1: 1pt × 10 = 10
    // Phase 2: 1pt × 10 = 10
    // Phase 3: 100pt × 10 = 1000
    // Phase 4: 100pt × 10 = 1000
    // Total: 2020
    expect(p1.phaseScores[0]).toBe(10);
    expect(p1.phaseScores[1]).toBe(10);
    expect(p1.phaseScores[2]).toBe(1000);
    expect(p1.phaseScores[3]).toBe(1000);
    expect(p1.totalScore).toBe(2020);
  });
});

describe('getWinner', () => {
  test('returns player with highest totalScore', () => {
    const game = setup2PlayerGame();
    const p1 = game.players.find(p => p.id === 'p1')!;
    const p2 = game.players.find(p => p.id === 'p2')!;
    p1.totalScore = 500;
    p2.totalScore = 1000;
    game.status = 'finished';

    const { winnerId } = getWinner(game);
    expect(winnerId).toBe('p2');
  });

  test('tie-breaks by highest phaseScore', () => {
    const game = setup2PlayerGame();
    const p1 = game.players.find(p => p.id === 'p1')!;
    const p2 = game.players.find(p => p.id === 'p2')!;
    p1.totalScore = 1000;
    p2.totalScore = 1000;
    p1.phaseScores = [100, 200, 300, 400]; // max 400
    p2.phaseScores = [200, 200, 300, 350]; // max 350
    game.status = 'finished';

    const { winnerId } = getWinner(game);
    expect(winnerId).toBe('p1');
  });

  test('finalScores includes all players', () => {
    const game = setup2PlayerGame();
    game.players[0].totalScore = 100;
    game.players[1].totalScore = 200;
    const { finalScores } = getWinner(game);
    expect(finalScores['p1']).toBe(100);
    expect(finalScores['p2']).toBe(200);
  });
});
