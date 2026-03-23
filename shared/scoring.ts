import { KILL_NUMBER } from './constants';

/**
 * Calculate points for a single die roll in the given phase.
 *
 * Scoring is CUMULATIVE across phases:
 *   Phase 1: face value (except 4)
 *   Phase 2: 5 = 50, rest face value (except 4)
 *   Phase 3: 1 = 100, 5 = 50, rest face value (except 4)
 *   Phase 4: 2 = doubles current round score, plus all above
 */
export function scoreRoll(
  roll: number,
  phase: number,
  currentRoundScore: number
): { points: number; isKill: boolean; isDouble: boolean } {
  if (roll === KILL_NUMBER) {
    return { points: 0, isKill: true, isDouble: false };
  }

  // Phase 4+: 2 doubles the entire current round score
  if (phase >= 4 && roll === 2) {
    return { points: currentRoundScore, isKill: false, isDouble: true };
  }

  // Phase 3+: 1 = 100 points
  if (phase >= 3 && roll === 1) {
    return { points: 100, isKill: false, isDouble: false };
  }

  // Phase 2+: 5 = 50 points
  if (phase >= 2 && roll === 5) {
    return { points: 50, isKill: false, isDouble: false };
  }

  // Default: face value
  return { points: roll, isKill: false, isDouble: false };
}
