// Marking a tapped answer. Feedback is informational — which chord was right,
// which wasn't, and what it was — never points.
//
// An answer played on a MIDI keyboard is read here too (`gradeNotes`): the notes
// become the answer a tap would have given, by pitch-class set.
//
// Pure.

import { Chord, Note } from 'tonal';
import { numeralOf, parseNumeral } from '$lib/model/numerals';
import { QUALITIES, type QualityId } from './items';
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

// ---- answers played on a keyboard ----

/** Roots for the candidate chords. Spelling doesn't matter: numeralOf and the
 *  qualities read chroma and intervals, never letters. */
const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Every chord a numeral can name (numerals.ts: triads, ° / ø / +, 7 / maj7). */
const NUMERAL_SUFFIXES = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'mMaj7', 'm7b5', 'dim7', '7#5', 'maj7#5'];

const QUALITY_IDS = Object.keys(QUALITIES) as QualityId[];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** A pitch-class set as a sorted key, so two sets compare as strings. */
const setKey = (pcs: Iterable<number>) => [...new Set(pcs)].sort((a, b) => a - b).join(',');

/** Each suffix's pitch classes above its root, read once from tonal. */
const SHAPES = new Map<string, number[]>();
function shape(suffix: string): number[] {
	let pcs = SHAPES.get(suffix);
	if (!pcs) {
		pcs = Chord.get(`C${suffix}`).notes.map((n) => Note.chroma(n)!);
		SHAPES.set(suffix, pcs);
	}
	return pcs;
}

/**
 * Chord symbols (root + one of `suffixes`) whose pitch-class set is EXACTLY the
 * notes' set, rooted on one of the notes. Inversions and doublings fold away;
 * a missing third or an extra note changes the set, so it matches something
 * else or nothing. The chord on the lowest note comes first, then upwards from
 * it: a symmetric chord (°7, +) is named from its bass unless the pad says
 * otherwise.
 */
function chordsFor(notes: readonly number[], suffixes: readonly string[]): { symbol: string; suffix: string }[] {
	if (notes.length === 0) return [];
	const played = setKey(notes.map(mod12));
	const bass = mod12(Math.min(...notes));
	const roots = [...new Set(notes.map(mod12))].sort((a, b) => mod12(a - bass) - mod12(b - bass));
	const out: { symbol: string; suffix: string }[] = [];
	for (const root of roots) {
		for (const suffix of suffixes) {
			if (setKey(shape(suffix).map((pc) => mod12(pc + root))) === played) {
				out.push({ symbol: `${PC_NAMES[root]}${suffix}`, suffix });
			}
		}
	}
	return out;
}

/** Fewer distinct pitch classes than this is not a chord (a note, a fifth). */
const MIN_PCS = 3;

/**
 * The answer a chord played on a keyboard gives, as a tap would give it — or
 * null when the notes aren't a chord this question can take.
 * - A question in a key: the chord's numeral, by numeralOf in the question's
 *   key. A numeral on the pad wins (so the set decides, not a guess at the
 *   root); a chord off the pad still answers, with its own numeral (which will
 *   be marked wrong, as it should: it isn't what was played).
 * - A quality question: the quality, on any root.
 * - A loop is four chords, not one: null.
 */
export function readNotes(q: Question, notes: readonly number[]): string | null {
	if (new Set(notes.map(mod12)).size < MIN_PCS) return null;
	if (q.kind === 'function') {
		const numerals = chordsFor(notes, NUMERAL_SUFFIXES)
			.map(({ symbol }) => numeralOf(symbol, q.key))
			.filter(Boolean);
		return numerals.find((n) => q.options.some((o) => sameNumeral(n, o))) ?? numerals[0] ?? null;
	}
	if (q.kind === 'quality') {
		const ids = chordsFor(
			notes,
			QUALITY_IDS.map((id) => QUALITIES[id].suffix)
		).map(({ suffix }) => QUALITY_IDS.find((id) => QUALITIES[id].suffix === suffix)!);
		return ids.find((id) => q.options.includes(id)) ?? ids[0] ?? null;
	}
	return null;
}

export interface NotesGrade {
	/** The answer the notes give (readNotes), or null. */
	value: string | null;
	/** Right for answer position `at`. */
	correct: boolean;
}

/**
 * Mark a chord played on a keyboard, by pitch-class set (chroma mod 12): the
 * same chord in any inversion or voicing is right, a missing third is wrong,
 * and an added seventh is right only where the question asks for that seventh.
 * `at` is the answer position (the slot being filled) of a function question.
 */
export function gradeNotes(q: Question, notes: readonly number[], at = 0): NotesGrade {
	const value = readNotes(q, notes);
	if (value === null) return { value, correct: false };
	if (q.kind === 'function') return { value, correct: at < q.answer.length && sameNumeral(value, q.answer[at]) };
	return { value, correct: value === q.answer };
}
