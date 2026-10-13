// A drill line cut into MEASURES, for the staff's barlines.
//
// Barlines fall where the click's bars fall: every `quartersPerBar` quarters
// from the start of the RUN (atQuarters is run-relative), not from the start of
// the key on screen. A key that starts mid-bar therefore opens with a partial
// measure — exactly what the player hears.
//
// A note that crosses a barline is split there into two pieces and tied, the way
// it is written on paper. A rest is split too, but never tied.
//
// Pure: positions in, pieces out.

export interface TimedNote {
	atQuarters: number;
	durQuarters: number;
	/** null = a rest. */
	midi: number | null;
}

export interface Piece {
	/** Index of the note this piece belongs to, in the input. */
	note: number;
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
			left -= piece;
			at += piece;
			current.push({
				note: index,
				durQuarters: piece,
				first,
				tieToNext: left > EPS && n.midi !== null
			});
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
