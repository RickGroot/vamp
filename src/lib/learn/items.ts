// What the Ear mode can ask: quiz items, each a stable id plus a spec that
// quiz.ts turns into questions.
//
// Item ids are PERSISTED (progress in `vamp:learn` is keyed by them): never
// rename one, add a new id instead. items.test.ts pins the shipped ids.
//
// Specs hold degree + quality (PresetChord, like the presets), never numerals:
// the numerals a question asks for and the buttons it offers are computed from
// the chords with numeralOf, so an answer can't be typed wrong.
//
// Titles and ledes are original text. Titles are names, set in their own case
// (never uppercased), and stay free of numerals so they read the same in a
// select, where nothing can be drawn.
//
// Pure.

import type { KeyInfo } from '$lib/model/key';
import type { PresetChord } from '$lib/model/presets';

/** The chord qualities the ear can be asked to tell apart. */
export type QualityId = 'major' | 'minor' | 'dim' | 'aug' | '7' | 'maj7' | 'm7' | 'm7b5';

export const QUALITIES: Record<QualityId, { suffix: string; name: string }> = {
	major: { suffix: '', name: 'Major' },
	minor: { suffix: 'm', name: 'Minor' },
	dim: { suffix: 'dim', name: 'Diminished' },
	aug: { suffix: 'aug', name: 'Augmented' },
	'7': { suffix: '7', name: 'Dominant seventh' },
	maj7: { suffix: 'maj7', name: 'Major seventh' },
	m7: { suffix: 'm7', name: 'Minor seventh' },
	m7b5: { suffix: 'm7b5', name: 'Half-diminished' }
};

/** Name the numerals of a short progression, heard after the key's cadence. */
export interface FunctionSpec {
	kind: 'function';
	mode: KeyInfo['mode'];
	/** The chords a question may use; their numerals are the answer pad. */
	chords: PresetChord[];
	/** Chords per question. */
	length: number;
}

/** Name the loop, from four. */
export interface LoopSpec {
	kind: 'loop';
	/** Loop ids (loops.ts) the answer and the wrong options come from. */
	loops: string[];
}

/** Name a chord's quality, one bar of it, no key. */
export interface QualitySpec {
	kind: 'quality';
	qualities: QualityId[];
}

export type QuizSpec = FunctionSpec | LoopSpec | QualitySpec;
export type QuizKind = QuizSpec['kind'];

export interface QuizItem {
	/** Persisted. Never rename; add a new id. */
	id: string;
	title: string;
	/** One line under the title: what you'll hear. */
	lede: string;
	spec: QuizSpec;
}

const c = (semitones: number, quality = ''): PresetChord => ({ semitones, quality });

export const QUIZ_ITEMS: QuizItem[] = [
	// ---- Chords in a key: the cadence sets home, then name each chord ----
	{
		id: 'fn-three-chords',
		title: 'Three chords',
		lede: 'Home, the chord a fourth up and the chord a fifth up. Most songs start here.',
		spec: { kind: 'function', mode: 'major', chords: [c(0), c(5), c(7)], length: 3 }
	},
	{
		id: 'fn-four-chords',
		title: 'Four chords',
		lede: 'The same three, plus the minor chord that darkens a major key.',
		spec: { kind: 'function', mode: 'major', chords: [c(0), c(5), c(7), c(9, 'm')], length: 4 }
	},
	{
		id: 'fn-rock-chords',
		title: 'Rock chords',
		lede: 'Adds the major chord a whole step below home, as common in rock as the minor ones.',
		spec: { kind: 'function', mode: 'major', chords: [c(0), c(5), c(7), c(10)], length: 4 }
	},
	{
		id: 'fn-whole-key',
		title: 'The whole key',
		lede: 'All six everyday chords of a major key, minor ones included.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0), c(2, 'm'), c(4, 'm'), c(5), c(7), c(9, 'm')],
			length: 4
		}
	},
	{
		id: 'fn-minor-key',
		title: 'Minor key',
		lede: 'A minor home, its minor iv, the major V that pulls back, and the two big chords below.',
		spec: { kind: 'function', mode: 'minor', chords: [c(0, 'm'), c(5, 'm'), c(7), c(8), c(10)], length: 4 }
	},
	{
		id: 'fn-sevenths',
		title: 'Seventh chords',
		lede: 'The four sevenths a jazz tune in a major key is made of.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0, 'maj7'), c(2, 'm7'), c(7, '7'), c(9, 'm7')],
			length: 4
		}
	},
	{
		id: 'fn-minor-sevenths',
		title: 'Minor sevenths',
		lede: 'Sevenths in a minor key, with the half-diminished ii.',
		spec: {
			kind: 'function',
			mode: 'minor',
			chords: [c(0, 'm7'), c(2, 'm7b5'), c(5, 'm7'), c(7, '7'), c(8, 'maj7')],
			length: 4
		}
	},

	// ---- Loops: name it from four ----
	{
		id: 'loop-pop',
		title: 'Pop loops',
		lede: 'Four chords on repeat. Which loop is it?',
		spec: {
			kind: 'loop',
			loops: ['axis', 'axis-vi', 'axis-iv', 'axis-v', 'doowop', 'hopscotch', 'royal-road']
		}
	},
	{
		id: 'loop-rock',
		title: 'Rock loops',
		lede: 'Loops with chords from outside the key, in major and minor.',
		spec: { kind: 'loop', loops: ['axis', 'hopscotch', 'mixolydian', 'mario', 'epic', 'andalusian'] }
	},
	{
		id: 'loop-jazz',
		title: 'Jazz loops',
		lede: 'Turnarounds and ii–V–Is, in sevenths.',
		spec: { kind: 'loop', loops: ['jazz-251', 'minor-251', 'turnaround', 'turnaround-iii', 'doowop-sevenths'] }
	},

	// ---- Chord quality: one chord, no key ----
	{
		id: 'quality-major-minor',
		title: 'Major or minor',
		lede: 'One chord. Bright or dark?',
		spec: { kind: 'quality', qualities: ['major', 'minor'] }
	},
	{
		id: 'quality-triads',
		title: 'Four triads',
		lede: 'Major and minor, plus the tense diminished and the floating augmented.',
		spec: { kind: 'quality', qualities: ['major', 'minor', 'dim', 'aug'] }
	},
	{
		id: 'quality-sevenths',
		title: 'Four sevenths',
		lede: 'The four sevenths of jazz, one at a time.',
		spec: { kind: 'quality', qualities: ['maj7', '7', 'm7', 'm7b5'] }
	}
];

const BY_ID = new Map(QUIZ_ITEMS.map((item) => [item.id, item]));

export function quizItemById(id: string): QuizItem | null {
	return BY_ID.get(id) ?? null;
}

/** How the Ear mode groups the items, in this order. */
export const KIND_TITLES: Record<QuizKind, string> = {
	function: 'Chords in a key',
	loop: 'Loops',
	quality: 'Chord quality'
};
