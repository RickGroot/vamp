// Practice-drill logic — pure and position-based so it's unit-testable and the
// engine/stores stay thin.
//
//  - Click feel: which beats the metronome sounds (time-feel training).
//  - Tempo step-up: nudge BPM each loop toward a ceiling.
//  - Key cycle: how far to transpose between loops to drill all 12 keys.

export type ClickFeel = 'all' | 'backbeat' | 'downbeat';

export type KeyCycleMode = 'off' | 'fourths' | 'semitone' | 'random';

/** Whether the metronome clicks on a given 0-based beat of the bar for a feel. */
export function clickAtBeat(beatIndexInBar: number, feel: ClickFeel): boolean {
	switch (feel) {
		case 'backbeat':
			return beatIndexInBar % 2 === 1; // beats 2 & 4 (0-based 1, 3)
		case 'downbeat':
			return beatIndexInBar === 0; // beat 1 only
		default:
			return true;
	}
}

/** Next tempo when stepping up: current + step, capped at `max`. */
export function nextStepTempo(current: number, step: number, max: number): number {
	return Math.min(max, Math.round(current + step));
}

/**
 * Semitones to transpose for the next loop of a key-cycle drill. `fourths` walks
 * the cycle of fourths (the classic all-keys drill); `random` jumps a random
 * non-zero interval. Returns 0 when off.
 */
export function keyCycleInterval(mode: KeyCycleMode, rand: () => number = Math.random): number {
	switch (mode) {
		case 'fourths':
			return 5; // up a perfect fourth
		case 'semitone':
			return 1;
		case 'random':
			return 1 + Math.floor(rand() * 11); // 1..11
		default:
			return 0;
	}
}
