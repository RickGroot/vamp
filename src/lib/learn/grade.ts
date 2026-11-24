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

// ---- a played line (Licks, call and response) --------------------------------

/** Extra notes (between the matched ones) a line may hold and still be right. */
export const MAX_STRAY = 1;
/** Fewer notes heard than this (or the line's length, if shorter) is no attempt. */
export const MIN_HEARD = 2;
/** The longest expected line gradeLine is built for (the DP is n x m). */
export const MAX_LINE = 64;

/** A pitch class 0-11, safe for negative MIDI numbers. */
export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export interface LineGrade {
	verdict: 'right' | 'wrong' | 'none';
	/** One per expected note: heard in order, or missed. */
	marks: ('hit' | 'missed')[];
	/** Indices into `played` of extra notes BEFORE the last matched one. */
	strays: number[];
	/** Notes played after the last matched one. */
	trailing: number;
	/** [expected index, played index] pairs, ascending in both. */
	matched: [number, number][];
	missed: number;
	expected: number;
	played: number;
}

/**
 * Grade a played line against the expected one by PITCH CLASS (any octave
 * counts), in order: the longest common subsequence decides which expected
 * notes were heard. Right = every note heard and at most `maxStray` extras in
 * between (a slip on the way is fine; trailing notes after the line are not
 * counted). Fewer than MIN_HEARD notes played is `none`: no attempt to judge.
 */
export function gradeLine(expected: number[], played: number[], opts: { maxStray?: number } = {}): LineGrade {
	const maxStray = opts.maxStray ?? MAX_STRAY;
	const e = expected.map(mod12);
	const p = played.map(mod12);
	const n = e.length;
	const m = p.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--)
			dp[i][j] = e[i] === p[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
	const matched: [number, number][] = [];
	const hit: boolean[] = new Array<boolean>(n).fill(false);
	const used: boolean[] = new Array<boolean>(m).fill(false);
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (e[i] === p[j]) {
			matched.push([i, j]);
			hit[i] = true;
			used[j] = true;
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
		else j++;
	}
	const last = matched.length ? matched[matched.length - 1][1] : -1;
	const strays: number[] = [];
	for (let k = 0; k < last; k++) if (!used[k]) strays.push(k);
	const trailing = m - 1 - last;
	const missed = hit.filter((h) => !h).length;
	const verdict: LineGrade['verdict'] =
		m === 0 || n === 0 || m < Math.min(MIN_HEARD, n)
			? 'none'
			: missed === 0 && strays.length <= maxStray
				? 'right'
				: 'wrong';
	return { verdict, marks: hit.map((h) => (h ? 'hit' : 'missed')), strays, trailing, matched, missed, expected: n, played: m };
}
