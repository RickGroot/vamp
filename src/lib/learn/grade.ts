// Marking a tapped answer. Feedback is informational — which chord was right,
// which wasn't, and what it was — never points.
//
// Pure.

import { parseNumeral } from '$lib/model/numerals';
import type { Question } from './quiz';

export interface Grade {
	correct: boolean;
	/** One mark per answer position (a single-choice question has one). */
	marks: boolean[];
}

/**
 * Two numerals for the same chord: same degree, quality and seventh. Both
 * sides come from numeralOf, so this is string equality in practice; parsing
 * keeps a hand-built answer (a test, a later MIDI answer) from failing on
 * spelling alone. Anything that doesn't parse must match exactly.
 */
export function sameNumeral(a: string, b: string): boolean {
	const x = parseNumeral(a);
	const y = parseNumeral(b);
	if (!x || !y) return a === b;
	return x.semitones === y.semitones && x.quality === y.quality && x.seventh === y.seventh;
}

/** Mark the given answer. A function answer must have one numeral per chord. */
export function gradeAnswer(q: Question, given: readonly string[]): Grade {
	if (q.kind === 'function') {
		const marks = q.answer.map((want, i) => i < given.length && sameNumeral(given[i], want));
		return { correct: given.length === q.answer.length && marks.every(Boolean), marks };
	}
	const right = given.length === 1 && given[0] === q.answer;
	return { correct: right, marks: [right] };
}
