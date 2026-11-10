// The built-in licks: ORIGINAL lines written for Vamp. No transcriptions, no
// method books, no lick collections, no famous licks by name — the same rule as
// practice/patterns.ts.
//
// Each lick is degrees of the key (tokens.ts) over its own changes (numerals),
// so it plays in every key. Library rules, enforced by library.test.ts:
// - ids are PERSISTED (progress will be keyed by them): never rename one, add
//   a new id instead;
// - one rhythm value per token, every value ≥ half a beat (the staff floors at
//   an eighth), summing exactly to the changes;
// - a span of at most 18 semitones, so every key at every transposition fits
//   trumpet, alto, tenor, horn, flute and keys (fitOctave needs span ≤ width − 11);
// - the last note sounding is a chord tone of the last chord;
// - blues licks bend nothing (a written bend can't be played on keys or heard
//   from a sampler): the blue note is a grace step instead.
//
// Names are plain descriptions in their own case, like drill names.

import type { LickDefinition, LickStyle } from './types';

export const LICK_STYLES: LickStyle[] = ['blues', 'rock', 'jazz'];

export const LICK_STYLE_NAMES: Record<LickStyle, string> = {
	blues: 'Blues',
	rock: 'Rock',
	jazz: 'Jazz'
};

const FOUR = { numerator: 4, denominator: 4 };

const builtIn = (lick: Omit<LickDefinition, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'timeSignature' | 'builtIn'>): LickDefinition => ({
	schemaVersion: 1,
	createdAt: 0,
	updatedAt: 0,
	timeSignature: FOUR,
	builtIn: true,
	...lick
});

export const BUILT_IN_LICKS: LickDefinition[] = [
	builtIn({
		id: 'lick-blues-thirds',
		name: 'Minor third to major',
		description: 'Slide off the minor third onto the major one, then answer the same move on the four chord.',
		mode: 'major',
		style: 'blues',
		feel: 'swing',
		changes: [
			{ numeral: 'I7', beats: 4 },
			{ numeral: 'IV7', beats: 4 },
			{ numeral: 'I7', beats: 8 }
		],
		notes: ['b3', '3', '5', 'b7', '8', 'b7', '5', '6', '5', '4', 'b3', '1', 'b3', '3', '1', 'r'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1.5, 0.5, 0.5, 3, 4]
	}),
	builtIn({
		id: 'lick-blues-minor',
		name: 'Minor blues falls',
		description: 'Fall down the minor pentatonic through the flat five, climb the four chord, then fall again home.',
		mode: 'minor',
		style: 'blues',
		feel: 'swing',
		changes: [
			{ numeral: 'i7', beats: 4 },
			{ numeral: 'iv7', beats: 4 },
			{ numeral: 'i7', beats: 8 }
		],
		notes: ['8', 'b7', '5', 'b5', '4', 'b3', '1', '4', 'b6', '8', 'b10', '8', 'b6', '5', 'b5', '4', 'b3', '1', 'r'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1.5, 4]
	}),
	builtIn({
		id: 'lick-rock-mixolydian',
		name: 'Flat seven rock line',
		description: 'A major-key line that leans on the flat seven when the chord drops a whole step, then walks home.',
		mode: 'major',
		style: 'rock',
		feel: 'straight',
		changes: [
			{ numeral: 'I', beats: 4 },
			{ numeral: 'bVII', beats: 4 },
			{ numeral: 'IV', beats: 4 },
			{ numeral: 'I', beats: 4 }
		],
		notes: ['5', '6', '8', '6', '5', '3', 'b7', '8', 'b7', '4', '2', '1', '4', '6', '8', '6', '5', '3', '1'],
		rhythm: [0.5, 0.5, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1, 1, 1.5, 0.5, 2]
	}),
	builtIn({
		id: 'lick-rock-minor-pent',
		name: 'Minor pentatonic riff',
		description: 'Up the minor pentatonic, hang on the five of the flat-seven chord, and settle back on home.',
		mode: 'minor',
		style: 'rock',
		feel: 'straight',
		changes: [
			{ numeral: 'i', beats: 4 },
			{ numeral: 'bVII', beats: 4 },
			{ numeral: 'i', beats: 8 }
		],
		notes: ['1', 'b3', '4', '5', 'b7', '5', 'b7', '8', 'b7', '4', '5', '4', 'b3', '4', '1', 'r'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 2, 0.5, 0.5, 0.5, 0.5, 4, 2]
	}),
	builtIn({
		id: 'lick-jazz-251-major',
		name: 'Major two-five-one line',
		description: 'Climb the minor chord from its third, outline the dominant with its flat nine, and land on the third of home.',
		mode: 'major',
		style: 'jazz',
		feel: 'swing',
		changes: [
			{ numeral: 'ii7', beats: 4 },
			{ numeral: 'V7', beats: 4 },
			{ numeral: 'Imaj7', beats: 8 }
		],
		notes: ['r', '4', '6', '8', '10', '9', '8', '7', '9', '11', 'b13', '12', '11', '10', '9', '7', '5', '3', 'r'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 1.5, 0.5, 0.5, 0.5, 2, 3]
	}),
	builtIn({
		id: 'lick-jazz-251-minor',
		name: 'Minor two-five-one line',
		description: 'Outline the half-diminished chord, step up to the leading tone on the dominant, and resolve down to home.',
		mode: 'minor',
		style: 'jazz',
		feel: 'swing',
		changes: [
			{ numeral: 'iiø7', beats: 4 },
			{ numeral: 'V7', beats: 4 },
			{ numeral: 'i7', beats: 8 }
		],
		notes: ['r', '4', 'b6', '8', '9', '8', 'b6', '7', '9', '11', 'b13', '12', '11', 'b10', '9', '8', 'b7', '5', 'r'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5, 1, 2, 3]
	}),
	builtIn({
		id: 'lick-jazz-maj7-ninth',
		name: 'Major seventh up to the ninth',
		description: 'Run up the major seventh chord to its ninth, then circle the third from above and below before landing on it.',
		mode: 'major',
		style: 'jazz',
		feel: 'swing',
		changes: [{ numeral: 'Imaj7', beats: 8 }],
		notes: ['1', '3', '5', '7', '9', '7', '5', '6', '5', '4', '#2', '3'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 2]
	}),
	builtIn({
		id: 'lick-jazz-flat-nine',
		name: 'Flat nine into home',
		description: 'Climb the diminished shape over the dominant, let the flat nine fall a half step, and resolve to the third.',
		mode: 'major',
		style: 'jazz',
		feel: 'swing',
		changes: [
			{ numeral: 'V7', beats: 4 },
			{ numeral: 'Imaj7', beats: 4 }
		],
		notes: ['7', '9', '11', 'b13', '12', '11', '9', '7', '8', '5', '3'],
		rhythm: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 0.5, 2]
	})
];

const BY_ID = new Map(BUILT_IN_LICKS.map((l) => [l.id, l]));

export const lickById = (id: string): LickDefinition | undefined => BY_ID.get(id);

/** The built-ins of one style, in library order. */
export const licksOfStyle = (style: LickStyle): LickDefinition[] =>
	BUILT_IN_LICKS.filter((l) => l.style === style);
