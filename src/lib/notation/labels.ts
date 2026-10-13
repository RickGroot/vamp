// Horizontal placement of the chord names above one row of notation.
//
// A name is centred on its note — unless that would run it into something:
//   • left of its bar's note area (`min`): at the start of a row that area
//     begins after the treble clef, and on a phone the first note sits right
//     beside the clef, so a centred "Bbmaj7" spilled over it;
//   • into the previous name on the row (`gap` apart);
//   • past the right edge of the staff (`maxRight`).
// Pure: measured widths in, left edges out (draw with text-anchor="start").

export interface LabelBox {
	/** The note's x — where the name would be centred. */
	x: number;
	/** The name's measured width. */
	w: number;
	/** The leftmost x the name may start at (its bar's note-area start). */
	min: number;
}

/** Left edge for each name, in the order given. Names are assumed sorted by `x`. */
export function placeLabels(boxes: LabelBox[], maxRight: number, gap = 6): number[] {
	const left: number[] = [];
	// Forward: centred, but never left of its bar's note area or into the previous name.
	for (let i = 0; i < boxes.length; i++) {
		const b = boxes[i];
		let l = Math.max(b.x - b.w / 2, b.min);
		if (i > 0) l = Math.max(l, left[i - 1] + boxes[i - 1].w + gap);
		left.push(l);
	}
	// Backward: pull names in from the right edge, never past their own minimum.
	let limit = maxRight;
	for (let i = boxes.length - 1; i >= 0; i--) {
		const b = boxes[i];
		if (left[i] + b.w > limit) left[i] = Math.max(b.min, limit - b.w);
		limit = left[i] - gap;
	}
	return left;
}
