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
export type QualityId = 'major' | 'minor' | 'dim' | 'aug' | '7' | 'maj7' | 'm7' | 'm7b5' | 'maj9' | '9' | 'm9' | 'sus4' | '7sus4' | '7b9' | '7#9' | '7#11';

export const QUALITIES: Record<QualityId, { suffix: string; name: string }> = {
	major: { suffix: '', name: 'Major' },
	minor: { suffix: 'm', name: 'Minor' },
	dim: { suffix: 'dim', name: 'Diminished' },
	aug: { suffix: 'aug', name: 'Augmented' },
	'7': { suffix: '7', name: 'Dominant seventh' },
	maj7: { suffix: 'maj7', name: 'Major seventh' },
	m7: { suffix: 'm7', name: 'Minor seventh' },
	m7b5: { suffix: 'm7b5', name: 'Half-diminished' },
	maj9: { suffix: 'maj9', name: 'Major ninth' },
	'9': { suffix: '9', name: 'Dominant ninth' },
	m9: { suffix: 'm9', name: 'Minor ninth' },
	sus4: { suffix: 'sus4', name: 'Suspended fourth' },
	'7sus4': { suffix: '7sus4', name: 'Suspended seventh' },
	'7b9': { suffix: '7b9', name: 'Dominant flat ninth' },
	'7#9': { suffix: '7#9', name: 'Dominant sharp ninth' },
	'7#11': { suffix: '7#11', name: 'Dominant sharp eleventh' }
};

/** Name the numerals of a short progression, heard after the key's cadence. */
export interface FunctionSpec {
	kind: 'function';
	mode: KeyInfo['mode'];
	/** The chords a question may use; their numerals are the answer pad. */
	chords: PresetChord[];
	/** Chords per question. */
	length: number;
	/** When set, every question holds at least one of these (each also in `chords`). */
	must?: PresetChord[];
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
/** A chord over a held bass (a slash chord); the bass is semitones above the tonic. */
const over = (semitones: number, quality: string, bass: number): PresetChord => ({ semitones, quality, bass });

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
		// Lesson 3.3's quiz: the minor key's chords on a major home.
		id: 'fn-borrowed',
		title: 'Borrowed chords',
		lede: 'Home, four and five, plus the minor four, flat six and flat seven from the minor key.',
		spec: { kind: 'function', mode: 'major', chords: [c(0), c(5), c(7), c(5, 'm'), c(8), c(10)], length: 4 }
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
		// Lesson 4.1's quiz: the minor v and the major V side by side.
		id: 'fn-minor-five',
		title: 'Two fives',
		lede: 'A minor home with its minor v and its major V, and the two flat chords around them.',
		// No minor iv: i–v–i–v in one key is iv–i–iv–i in another, the same four symbols.
		spec: { kind: 'function', mode: 'minor', chords: [c(0, 'm'), c(7, 'm'), c(7), c(8), c(10)], length: 4 }
	},
	{
		// Lesson 4.3's quiz: a major chord on the minor home.
		id: 'fn-minor-ending',
		title: 'Major ending',
		lede: 'A minor key where home can come back as a major chord.',
		spec: { kind: 'function', mode: 'minor', chords: [c(0, 'm'), c(0), c(5, 'm'), c(7), c(8)], length: 4 }
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

	{
		// Lesson 6.2's quiz: the chords of a jazz blues, the dominants and the ii–V's.
		id: 'fn-jazz-blues',
		title: 'Jazz blues chords',
		lede: 'The chords a jazz blues is made of: dominants on the first, fourth and sixth degrees, and a two–five to turn it round.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0, '7'), c(5, '7'), c(9, '7'), c(2, 'm7'), c(7, '7'), c(7, 'm7')],
			length: 4
		}
	},
	{
		id: 'fn-minor-blues',
		title: 'Minor blues chords',
		lede: 'The four chords of a minor blues: the minor one and four, the dominant on the flat six, and the dominant five.',
		spec: {
			kind: 'function',
			mode: 'minor',
			chords: [c(0, 'm7'), c(5, 'm7'), c(8, '7'), c(7, '7')],
			length: 4
		}
	},
	{
		// Lesson 6.3's quiz: the chords of a bridge that travels in dominants.
		id: 'fn-rhythm-changes',
		title: 'Rhythm changes',
		lede: 'Home, the chords of the turnaround and its detours, and the four dominants of the bridge.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0, 'maj7'), c(2, 'm7'), c(7, '7'), c(9, 'm7'), c(4, 'm7'), c(4, '7'), c(9, '7'), c(2, '7')],
			length: 4
		}
	},
	{
		// Lesson 6.4's quiz: a tune that falls in fifths, with its turn into the relative minor.
		id: 'fn-fifths-fall',
		title: 'Falling in fifths',
		lede: 'The sevenths of a major key as a tune falls through them, with one dominant that turns toward the relative minor.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(2, 'm7'), c(7, '7'), c(0, 'maj7'), c(5, 'maj7'), c(11, 'm7b5'), c(4, '7'), c(9, 'm7'), c(4, 'm7')],
			length: 4
		}
	},

	// ---- Dominants: swap, side door and passing chord (Track 7) ----
	{
		// Lesson 7.1's quiz: the plain V7 beside the dominant a tritone away.
		id: 'fn-substitutes',
		title: 'Substitute dominants',
		lede: 'The dominant a half step above home, heard beside the plain five. The chords come in any order.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0, 'maj7'), c(2, 'm7'), c(7, '7'), c(1, '7'), c(9, 'm7')],
			length: 4,
			must: [c(1, '7')]
		}
	},
	{
		// Lesson 7.2's quiz: the dominant a whole step under home, beside the plain five.
		id: 'fn-back-door',
		title: 'The back door',
		lede: 'The dominant a whole step under home, heard beside the plain five. The chords come in any order.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0, 'maj7'), c(5, 'm7'), c(10, '7'), c(7, '7'), c(2, 'm7')],
			length: 4,
			must: [c(10, '7')]
		}
	},
	{
		// Lesson 7.3's quiz: a diminished chord a half step under the next root. One
		// dim7 only: the chord is symmetric, so a second one would share its notes.
		id: 'fn-passing-dim',
		title: 'Passing chords',
		lede: 'A diminished chord that slips between home and the chord above it. The chords come in any order.',
		spec: {
			kind: 'function',
			mode: 'major',
			chords: [c(0, 'maj7'), c(1, 'dim7'), c(2, 'm7'), c(7, '7'), c(9, 'm7')],
			length: 4,
			must: [c(1, 'dim7')]
		}
	},
	{
		// Lesson 9.1's quiz: a minor home, its major fourth and the ordinary minor ones.
		// The key's cadence (i-iv-V-i) is the ordinary minor one, so a major IV stands out against it.
		id: 'fn-dorian',
		title: 'Dorian chords',
		lede: 'A minor home with a major chord on the fourth step, beside the ordinary minor fourth. The key plays its usual minor cadence first, so listen for the brighter chord.',
		spec: { kind: 'function', mode: 'minor', chords: [c(0, 'm'), c(5, 'm'), c(5), c(10)], length: 4, must: [c(5)] }
	},
	{
		// Lesson 9.2's quiz: the same numerals as ever, heard over a held bass.
		id: 'fn-pedal',
		title: 'Over a held bass',
		lede: 'The bass holds home under every chord. Name the chord played above it, not the bass note.',
		spec: { kind: 'function', mode: 'major', chords: [c(0), over(5, '', 0), over(7, '', 0), over(10, '', 0)], length: 4 }
	},
	{
		// Lesson 9.3's quiz: major chords a third from home.
		id: 'fn-mediants',
		title: 'Chords a third apart',
		lede: 'Home and the major chords a third above or below it. Name each one.',
		spec: { kind: 'function', mode: 'major', chords: [c(0), c(3), c(4), c(8), c(9)], length: 3 }
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
		lede: 'Turnarounds, chains of dominants and two–five–ones, in sevenths.',
		spec: {
			kind: 'loop',
			loops: [
				'jazz-251',
				'minor-251',
				'turnaround',
				'turnaround-iii',
				'turnaround-dominants',
				'dominant-chain',
				'doowop-sevenths',
				'tritone-251',
				'backdoor-251'
			]
		}
	},

	{
		// Lesson 4.2's quiz: the minor loops, none a rotation of another.
		id: 'loop-minor',
		title: 'Minor loops',
		lede: 'Four minor-key loops with no seventh chords. Which one is it?',
		spec: { kind: 'loop', loops: ['andalusian', 'aeolian', 'minor-circle', 'epic'] }
	},
	{
		// Lesson 9.4's quiz: the major-thirds cycle among the seventh-chord loops.
		// It is the only six-chord loop in the pool, so length alone gives it away; the item
		// still teaches the cycle's shape (see Critic notes in the design).
		id: 'loop-thirds',
		title: 'Cycles of thirds',
		lede: 'Loops in sevenths, one of which never settles on a home. Which loop is it?',
		spec: { kind: 'loop', loops: ['third-cycle', 'turnaround', 'jazz-251', 'doowop-sevenths'] }
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
	},
	// ---- Chord quality: colour (Track 8) ----
	{
		id: 'quality-ninths',
		title: 'Three ninths',
		lede: 'A major, a dominant and a minor chord, each with a ninth on top.',
		spec: { kind: 'quality', qualities: ['maj9', '9', 'm9'] }
	},
	{
		id: 'quality-suspended',
		title: 'Suspended or not',
		lede: 'A fourth where the third should be, on a triad and on a seventh.',
		spec: { kind: 'quality', qualities: ['major', 'sus4', '7', '7sus4'] }
	},
	{
		id: 'quality-altered',
		title: 'Altered dominants',
		lede: 'A plain dominant seventh and three ways to bend it.',
		spec: { kind: 'quality', qualities: ['7', '7b9', '7#9', '7#11'] }
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
