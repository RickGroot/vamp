// A drill line cut into MEASURES, for the staff's barlines and beams.
//
// Barlines fall where the click's bars fall: every `quartersPerBar` quarters
// from the start of the RUN (atQuarters is run-relative), not from the start of
// the key on screen. A key that starts mid-bar therefore opens with a partial
// measure — exactly what the player hears.
//
// A note that crosses a barline is split there into two pieces and tied, the way
// it is written on paper. A rest is split too, but never tied.
//
// Eighths (anything under a quarter) are beamed the way a part is engraved: in
// groups that never cross a barline or a rest — half a bar in 4/4 (which is
// also a four-note drill cell), a beat in other simple meters, a dotted quarter
// in 6/8, 9/8 and 12/8.
//
// Pure: positions in, pieces and groups out.

import type { TimeSignature } from '$lib/model/types';

export interface TimedNote {
	atQuarters: number;
	durQuarters: number;
	/** null = a rest. */
	midi: number | null;
}

export interface Piece {
	/** Index of the note this piece belongs to, in the input. */
	note: number;
	/** Where the piece starts, run-relative, in quarter notes. */
	atQuarters: number;
	durQuarters: number;
	/** The first (or only) piece of its note — where a label or chord name goes. */
	first: boolean;
	/** Tied into the next piece (same pitch, across a barline). */
	tieToNext: boolean;
}

export interface Measure {
	pieces: Piece[];
	/** Ends ON a barline. False only for the last measure, when the line stops mid-bar. */
	complete: boolean;
}

const EPS = 1e-6;

export function toMeasures(notes: TimedNote[], quartersPerBar: number): Measure[] {
	if (notes.length === 0) return [];
	const bar = quartersPerBar > EPS ? quartersPerBar : 4;
	const measures: Measure[] = [];
	let current: Piece[] = [];

	notes.forEach((n, index) => {
		let at = n.atQuarters;
		let left = n.durQuarters;
		let first = true;
		while (left > EPS) {
			// The next barline strictly after `at`.
			const nextBar = (Math.floor(at / bar + EPS) + 1) * bar;
			const piece = Math.min(left, nextBar - at);
			current.push({
				note: index,
				atQuarters: at,
				durQuarters: piece,
				first,
				tieToNext: left - piece > EPS && n.midi !== null
			});
			left -= piece;
			at += piece;
			first = false;
			if (Math.abs(at - nextBar) < EPS) {
				measures.push({ pieces: current, complete: true });
				current = [];
			}
		}
	});
	if (current.length) measures.push({ pieces: current, complete: false });
	return measures;
}

/** How many quarter notes one beam group spans in a meter. */
export function beamGroupQuarters(ts: TimeSignature): number {
	// Compound meters (6/8, 9/8, 12/8): the dotted-quarter beat.
	if (ts.denominator === 8 && ts.numerator % 3 === 0 && ts.numerator > 3) return 1.5;
	// 4/4: half a bar — the commonest way a line of eighths is beamed.
	if (ts.numerator === 4 && ts.denominator === 4) return 2;
	// Anything else: one beat.
	return 4 / ts.denominator;
}

/**
 * Which pieces to beam together, as runs of indexes into `pieces` (in order).
 * Only pitched pieces shorter than a quarter beam; a rest, a longer note, a
 * barline or a group boundary ends the run, and a run of one is no beam.
 */
export function beamGroups(
	pieces: Piece[],
	isRest: (piece: Piece) => boolean,
	quartersPerBar: number,
	groupQuarters: number
): number[][] {
	const bar = quartersPerBar > EPS ? quartersPerBar : 4;
	const span = groupQuarters > EPS ? groupQuarters : 1;
	const groups: number[][] = [];
	let run: number[] = [];
	let runKey = '';
	const close = () => {
		if (run.length > 1) groups.push(run);
		run = [];
		runKey = '';
	};
	pieces.forEach((p, i) => {
		if (isRest(p) || p.durQuarters >= 1 - EPS) {
			close();
			return;
		}
		const barIndex = Math.floor(p.atQuarters / bar + EPS);
		const inBar = p.atQuarters - barIndex * bar;
		const key = `${barIndex}:${Math.floor(inBar / span + EPS)}`;
		if (key !== runKey) close();
		run.push(i);
		runKey = key;
	});
	close();
	return groups;
}
