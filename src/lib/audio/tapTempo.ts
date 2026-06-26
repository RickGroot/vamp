// Tap-tempo helpers (pure, so they're unit-testable). The UI feeds in
// high-resolution timestamps (performance.now()); these compute the BPM and
// manage the rolling tap window.

/** Start a fresh tap window if the gap since the last tap exceeds this (ms). */
export const TAP_RESET_MS = 2000;

/** How many recent taps to average over. */
export const MAX_TAPS = 6;

/**
 * Append a tap timestamp, resetting the window when the gap since the previous
 * tap is too long (a new tempo is being counted in), and capping the window size.
 */
export function registerTap(
	timestamps: number[],
	now: number,
	resetMs = TAP_RESET_MS,
	maxTaps = MAX_TAPS
): number[] {
	const last = timestamps[timestamps.length - 1];
	const base = last !== undefined && now - last > resetMs ? [] : timestamps;
	return [...base, now].slice(-maxTaps);
}

/**
 * Average the consecutive intervals between taps and convert to BPM.
 * Returns null until there are at least two taps.
 */
export function bpmFromTaps(timestamps: number[]): number | null {
	if (timestamps.length < 2) return null;
	let sum = 0;
	for (let i = 1; i < timestamps.length; i++) sum += timestamps[i] - timestamps[i - 1];
	const avg = sum / (timestamps.length - 1);
	if (avg <= 0) return null;
	return Math.round(60000 / avg);
}
