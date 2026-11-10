// Degree tokens: how a lick's notes are written.
//
//   [b|#] + 1–7    the octave from the tonic up
//   [b|#] + 8–14   the octave above, so b9 / #9 / #11 / b13 read as the jazz names
//   [b|#] + _1–_7  the octave below (_5 is the fifth under the tonic)
//   r              a rest
//
// The token decides the SPELLING, as a drill note's name does: b5 in C is Gb,
// #4 is F#. Intervals are transposed from the written tonic, then `readable()`
// collapses double accidentals only — G♭ major's 4 stays C♭. Never
// Note.simplify a melodic name (practice/spelling.ts).
//
// Pure: tonal + practice siblings only.

import { Note } from 'tonal';
import { readable } from '$lib/practice/spelling';
import type { DrillRole } from '$lib/practice/types';

export interface ParsedToken {
	/** -1 flat, 0 natural, +1 sharp. */
	alter: -1 | 0 | 1;
	/** The scale degree 1–7 the token names. */
	degree: number;
	/** Whole octaves from the tonic's octave: -1 for `_`, 1 for 8–14. */
	octave: number;
}

const TOKEN_RE = /^([b#]?)(_?)(\d{1,2})$/;
/** Degrees whose natural interval is perfect (1, 4, 5); the rest are major. */
const PERFECT = new Set([1, 4, 5]);
/** The octave the line is spelled in before the range fitter moves it. */
export const NOMINAL_OCTAVE = 4;

/** True for a rest token. */
export const isRestToken = (token: string): boolean => token.trim() === 'r';

/** Parse a note token; null for a rest or anything that isn't one. */
export function parseToken(token: string): ParsedToken | null {
	const m = TOKEN_RE.exec(token.trim());
	if (!m) return null;
	const [, accidental, below, digits] = m;
	const n = Number(digits);
	if (below ? n < 1 || n > 7 : n < 1 || n > 14) return null;
	const degree = ((n - 1) % 7) + 1;
	const octave = below ? -1 : Math.floor((n - 1) / 7);
	const alter = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;
	// b1 / b8 would sit below the tonic it names: not a spelling anyone reads.
	if (alter === -1 && degree === 1) return null;
	return { alter, degree, octave };
}

/** The interval name above the tonic: '3m' for b3, '4A' for #4, '9m' for b9. */
export function tokenInterval(parsed: ParsedToken): string {
	const perfect = PERFECT.has(parsed.degree);
	const quality =
		parsed.alter === -1 ? (perfect ? 'd' : 'm') : parsed.alter === 1 ? 'A' : perfect ? 'P' : 'M';
	return `${parsed.degree}${quality}`;
}

/**
 * The spelled note (with octave) a token names from a written tonic pitch
 * class, or null for a rest / an unreadable token. MIDI is derived from THIS
 * name, so name and midi always agree.
 */
export function tokenToNote(token: string, writtenTonic: string): string | null {
	const parsed = parseToken(token);
	if (!parsed) return null;
	const tonic = Note.get(`${Note.get(writtenTonic).pc}${NOMINAL_OCTAVE + parsed.octave}`);
	if (tonic.empty) return null;
	const note = Note.transpose(tonic.name, tokenInterval(parsed));
	return note ? readable(note) : null;
}

/**
 * The degree label a player reads under the note: the octave marks drop out
 * ('_5' → '5', '8' → '1', '10' → '3'), but 9, 11 and 13 keep their jazz names
 * because that is what they are called over a chord. '' for a rest.
 */
export function tokenLabel(token: string): string {
	const parsed = parseToken(token);
	if (!parsed) return '';
	const written = Number(TOKEN_RE.exec(token.trim())?.[3]);
	const accidental = parsed.alter === -1 ? 'b' : parsed.alter === 1 ? '#' : '';
	const number = parsed.octave === 1 && (written === 9 || written === 11 || written === 13) ? written : parsed.degree;
	return `${accidental}${number}`;
}

/** What a note does in the key, from its degree (the same roles drills use). */
export function tokenRole(token: string): DrillRole {
	const parsed = parseToken(token);
	if (!parsed) return 'rest';
	switch (parsed.degree) {
		case 1:
			return 'root';
		case 3:
			return 'third';
		case 5:
			return 'fifth';
		case 7:
			return 'seventh';
		default:
			return 'scale';
	}
}

/** True when every token is a note or a rest the resolver can read. */
export function isValidToken(token: string): boolean {
	return isRestToken(token) || parseToken(token) !== null;
}
