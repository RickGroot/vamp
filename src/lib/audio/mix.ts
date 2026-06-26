// Rhythm-section mix + "trade fours" practice logic.
//
// Pure and position-based so the engine stays dumb and this stays unit-testable:
// - computeMixLevels turns the UI's per-lane mute/solo/volume into the effective
//   playback gain for each lane (standard mixer solo semantics).
// - isComping decides, for a given position, whether the band is comping or
//   leaving you open solo space ("trade fours"): the loop alternates blocks of
//   `tradeBars` bars, band → you → band → …

export type MixLane = 'chords' | 'bass' | 'drums';

export interface LaneState {
	/** 0..1 fader. */
	volume: number;
	mute: boolean;
	solo: boolean;
}

export type MixState = Record<MixLane, LaneState>;

/** Effective playback gain per lane, 0..1 (0 = silent). */
export interface MixLevels {
	chords: number;
	bass: number;
	drums: number;
}

export const MIX_LANES: MixLane[] = ['chords', 'bass', 'drums'];

export const MIX_LANE_LABELS: Record<MixLane, string> = {
	chords: 'Chords',
	bass: 'Bass',
	drums: 'Drums'
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function defaultLane(): LaneState {
	return { volume: 1, mute: false, solo: false };
}

export function defaultMix(): MixState {
	return { chords: defaultLane(), bass: defaultLane(), drums: defaultLane() };
}

/**
 * Resolve the per-lane gain. Standard mixer rule: if *any* lane is soloed, only
 * soloed lanes are audible; otherwise a lane is audible unless muted. Audible
 * lanes play at their fader volume.
 */
export function computeMixLevels(mix: MixState): MixLevels {
	const anySolo = MIX_LANES.some((lane) => mix[lane].solo);
	const level = (lane: MixLane): number => {
		const audible = anySolo ? mix[lane].solo : !mix[lane].mute;
		return audible ? clamp01(mix[lane].volume) : 0;
	};
	return { chords: level('chords'), bass: level('bass'), drums: level('drums') };
}

/**
 * Whether the backing should comp (true) or leave open solo space (false) at a
 * position, given the "trade fours" block length in bars. `tradeBars <= 0`
 * disables trading (always comping). The first block (band) comps, the next is
 * yours, and so on — computed within the loop, so pick a block length shorter
 * than your loop to actually get a turn.
 */
export function isComping(atQuarters: number, quartersPerBar: number, tradeBars: number): boolean {
	if (tradeBars <= 0 || quartersPerBar <= 0) return true;
	const bar = Math.floor(atQuarters / quartersPerBar + 1e-6);
	const block = Math.floor(bar / tradeBars);
	return block % 2 === 0;
}
