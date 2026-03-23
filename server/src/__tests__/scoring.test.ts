import { scoreRoll } from '@shared/scoring';

/** Helper: simulate a sequence of rolls and return running scores */
function simulateRolls(
  rolls: number[],
  phase: number
): { scores: number[]; killed: boolean } {
  const scores: number[] = [];
  let running = 0;
  for (const roll of rolls) {
    const { points, isKill, isDouble } = scoreRoll(roll, phase, running);
    if (isKill) {
      return { scores, killed: true };
    }
    if (isDouble) {
      running += points; // points === running, so running doubles
    } else {
      running += points;
    }
    scores.push(running);
  }
  return { scores, killed: false };
}

describe('scoreRoll — 6 required scenarios', () => {
  test('Phase 1: 3, 6, 1 → 3 → 9 → 10 (all face value)', () => {
    const { scores, killed } = simulateRolls([3, 6, 1], 1);
    expect(killed).toBe(false);
    expect(scores).toEqual([3, 9, 10]);
  });

  test('Phase 2: 5, 3, 5 → 50 → 53 → 103 (5s are worth 50)', () => {
    const { scores, killed } = simulateRolls([5, 3, 5], 2);
    expect(killed).toBe(false);
    expect(scores).toEqual([50, 53, 103]);
  });

  test('Phase 3: 1, 5, 3 → 100 → 150 → 153 (1=100, 5=50, 3=face)', () => {
    const { scores, killed } = simulateRolls([1, 5, 3], 3);
    expect(killed).toBe(false);
    expect(scores).toEqual([100, 150, 153]);
  });

  test('Phase 4: 3, 2, 2 → 3 → 6 → 12 (3=face, 2 doubles)', () => {
    const { scores, killed } = simulateRolls([3, 2, 2], 4);
    expect(killed).toBe(false);
    expect(scores).toEqual([3, 6, 12]);
  });

  test('Phase 4: 1, 2, 5 → 100 → 200 → 250 (1=100, 2 doubles, 5=50)', () => {
    const { scores, killed } = simulateRolls([1, 2, 5], 4);
    expect(killed).toBe(false);
    expect(scores).toEqual([100, 200, 250]);
  });

  test('Any phase: 5, 4 → 50 → KILLED (4 always kills)', () => {
    const { scores, killed } = simulateRolls([5, 4], 2);
    expect(killed).toBe(true);
    expect(scores).toEqual([50]); // only 5 was scored before kill
  });
});

describe('scoreRoll — edge cases', () => {
  test('Kill at 0 score', () => {
    const result = scoreRoll(4, 1, 0);
    expect(result.isKill).toBe(true);
    expect(result.points).toBe(0);
  });

  test('Double at 0 score produces 0 (double of nothing)', () => {
    const result = scoreRoll(2, 4, 0);
    expect(result.isDouble).toBe(true);
    expect(result.points).toBe(0); // points = currentRoundScore = 0
  });

  test('Phase 1: 5 is face value (not 50)', () => {
    const result = scoreRoll(5, 1, 0);
    expect(result.points).toBe(5);
    expect(result.isKill).toBe(false);
    expect(result.isDouble).toBe(false);
  });

  test('Phase 1: 1 is face value (not 100)', () => {
    const result = scoreRoll(1, 1, 0);
    expect(result.points).toBe(1);
  });

  test('Phase 2: 1 is face value (not 100 until phase 3)', () => {
    const result = scoreRoll(1, 2, 0);
    expect(result.points).toBe(1);
  });

  test('Phase 2: 2 is face value (not double until phase 4)', () => {
    const result = scoreRoll(2, 2, 50);
    expect(result.points).toBe(2);
    expect(result.isDouble).toBe(false);
  });

  test('Phase 3: 2 is still face value (not double until phase 4)', () => {
    const result = scoreRoll(2, 3, 100);
    expect(result.points).toBe(2);
    expect(result.isDouble).toBe(false);
  });

  test('Phase 4 inherits all previous rules: 1=100, 5=50', () => {
    expect(scoreRoll(1, 4, 0).points).toBe(100);
    expect(scoreRoll(5, 4, 0).points).toBe(50);
  });

  test('Multiple doubles in phase 4 are exponential', () => {
    const { scores } = simulateRolls([1, 2, 2, 2], 4);
    // 1→100, 2 doubles→200, 2 doubles→400, 2 doubles→800
    expect(scores).toEqual([100, 200, 400, 800]);
  });

  test('Roll of 6 is always face value across all phases', () => {
    for (let phase = 1; phase <= 4; phase++) {
      expect(scoreRoll(6, phase, 0).points).toBe(6);
    }
  });

  test('Roll of 3 is always face value across all phases', () => {
    for (let phase = 1; phase <= 4; phase++) {
      expect(scoreRoll(3, phase, 0).points).toBe(3);
    }
  });
});
