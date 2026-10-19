// The Learn curriculum: tracks and the lessons in them.
//
// Ten tracks (docs/learning-research.md §5) in a suggested order that forks
// after the four-chord loops into a pop/rock side and a jazz side, joining
// again for colour, harmony beyond function and changing key. `after` SUGGESTS
// an order; it never locks a track. Only the shared start and the first track
// of each side have lessons so far; the rest are listed as coming later.
//
// A lesson is a few short steps: listen (the band plays it), read (a paragraph
// or two), quiz (an Ear exercise, items.ts) and try (the passage opens in
// Sketch). Music is written as degree + quality (PresetChord, like the presets
// and the loops), so every lesson plays in any key, and the numerals beside it
// are COMPUTED with numeralOf, never typed.
//
// Text: ALL ORIGINAL, like practice/patterns.ts. Nothing paraphrased from
// Hooktheory, Open Music Theory or any textbook; songs are named only as
// factual references, never quoted. Numerals inside text are written in braces
// ('{IV} to {I}') so the UI can draw them (Numeral); everything else is words.
// Each read step stays short (curriculum.test.ts caps the words).
//
// Lesson ids are PERSISTED (progress in `vamp:learn` is keyed by them): never
// rename one, add a new id instead. curriculum.test.ts pins the shipped ids.
//
// Pure: no tone, no stores.

import type { Groove, InstrumentId, Progression } from '$lib/model/types';
import {
	createBar,
	createProgression,
	createSlot,
	DEFAULT_GROOVE,
	DEFAULT_TIME_SIGNATURE
} from '$lib/model/factory';
import type { Part } from '$lib/model/harmony';
import type { KeyInfo } from '$lib/model/key';
import { numeralOf } from '$lib/model/numerals';
import { buildPresetChord, type PresetChord } from '$lib/model/presets';
import { barBeats } from '$lib/model/time';
import { spellKey } from './keys';
import { loopById } from './loops';
import { cadenceSections, LEARN_TEMPO, learnPlan } from './plan';
import type { LearnCue, LearnRun, LearnSection } from './types';

// ---- the model ---------------------------------------------------------------

export type TrackId =
	| 'home'
	| 'three-chords'
	| 'four-chord-loops'
	| 'borrowed'
	| 'minor-keys'
	| 'sevenths'
	| 'jazz-forms'
	| 'dominants'
	| 'colour'
	| 'beyond-function'
	| 'changing-key';

/** Where a track sits on the map: the shared start, one side of the fork, or after it joins. */
export type Side = 'shared' | 'pop' | 'jazz' | 'joined';

/** The four things a track trains (research §5): hear it, read it, play it, use it. */
export type Skill = 'hear' | 'read' | 'play' | 'use';

type Mode = KeyInfo['mode'];

export interface Track {
	id: TrackId;
	number: number;
	/** A name: set in its own case, never uppercased. */
	name: string;
	side: Side;
	/** The tracks it is suggested after. A suggestion, never a lock. */
	after: TrackId[];
	/** One line on the map. Words only, no numerals. */
	summary: string;
	/** Lesson ids in order; empty = coming later. */
	lessons: string[];
}

/** A chord of a lesson: degree + quality, held for `beats` (default a bar). */
export interface LessonChord extends PresetChord {
	beats?: number;
}

/** The band plays a passage; you listen for one thing. */
export interface ListenStep {
	kind: 'listen';
	/** What to listen for. Numerals in braces. */
	text: string;
	mode: Mode;
	/** The passage as degree + quality… */
	chords?: LessonChord[];
	/** …or a named loop (loops.ts), a bar per chord. */
	loop?: string;
	/** Times through (default 1, a loop 2). */
	passes?: number;
	/** Set the key with its cadence first. */
	cadence?: boolean;
	/** Hold the last chord this many beats more, on its own bar, so it rings. */
	hold?: number;
	/** Once it has played, mark the home chord's chips "Home". */
	home?: boolean;
	tempo?: number;
}

/** A paragraph or two. */
export interface ReadStep {
	kind: 'read';
	/** Paragraphs. Numerals in braces. */
	text: string[];
}

/** An Ear exercise (items.ts) inside the lesson. */
export interface QuizStep {
	kind: 'quiz';
	item: string;
	text: string;
	/** A suggested number of questions before going on. Never a gate. */
	questions: number;
}

/** A passage to open in Sketch and play with. */
export interface TryStep {
	kind: 'try';
	/** What to do with it there. Numerals in braces. */
	text: string;
	song: TrySong;
}

/** A Sketch song as degree + quality: each bar's chords share it evenly; [] is a rest bar. */
export interface TrySong {
	/** The sketch's name, before " in <key>". */
	name: string;
	mode: Mode;
	bars: PresetChord[][];
	tempo?: number;
	instrument?: InstrumentId;
	groove?: Partial<Groove>;
}

export type LessonStep = ListenStep | ReadStep | QuizStep | TryStep;
export type StepKind = LessonStep['kind'];

export interface Lesson {
	/** Persisted. Never rename; add a new id. */
	id: string;
	track: TrackId;
	/** A name: its own case, no numerals (it is set in the display face). */
	title: string;
	skills: Skill[];
	steps: LessonStep[];
	/** Quiz items this lesson teaches: put into review when it is done. */
	items: string[];
}

/** Lesson progress, as stored (storage/learn.ts). */
export interface LessonProgress {
	/** The step you were last on, 0-based. */
	step: number;
	/** When it was finished (epoch ms); 0 for not yet. */
	done: number;
}

export type LessonState = 'new' | 'started' | 'done';

export const SKILL_NAMES: Record<Skill, string> = {
	hear: 'Hear',
	read: 'Read',
	play: 'Play',
	use: 'Use'
};

export const STEP_NAMES: Record<StepKind, string> = {
	listen: 'Listen',
	read: 'Read',
	quiz: 'Quiz',
	try: 'Try'
};

export const SIDE_NAMES: Record<Side, string> = {
	shared: 'Shared start',
	pop: 'Pop & rock',
	jazz: 'Jazz',
	joined: 'Joined'
};

// ---- the content -------------------------------------------------------------

const c = (semitones: number, quality = '', beats?: number): LessonChord =>
	beats === undefined ? { semitones, quality } : { semitones, quality, beats };

export const TRACKS: Track[] = [
	{
		id: 'home',
		number: 0,
		name: 'Home',
		side: 'shared',
		after: [],
		summary: 'Where a key comes to rest, and how major and minor chords differ.',
		lessons: ['home-hear-home', 'home-chord-colours']
	},
	{
		id: 'three-chords',
		number: 1,
		name: 'Three chords',
		side: 'shared',
		after: ['home'],
		summary: 'The chords on the first, fourth and fifth steps, and the two ways they lead home.',
		lessons: ['three-five-to-one', 'three-rock-ending', 'three-twelve-bar']
	},
	{
		id: 'four-chord-loops',
		number: 2,
		name: 'Four-chord loops',
		side: 'shared',
		after: ['three-chords'],
		summary: 'A minor chord joins the three, and four chords on repeat become the loops of pop.',
		lessons: ['loops-minor-six', 'loops-axis', 'loops-reordered']
	},
	{
		id: 'borrowed',
		number: 3,
		name: 'Borrowed chords',
		side: 'pop',
		after: ['four-chord-loops'],
		summary: 'Chords from the minor key on the same home note, which rock treats as everyday.',
		lessons: ['borrowed-flat-seven', 'borrowed-climbing-home', 'borrowed-minor-four']
	},
	{
		id: 'minor-keys',
		number: 4,
		name: 'Minor keys',
		side: 'pop',
		after: ['borrowed'],
		summary: 'Minor homes, the major chord that pulls back to them, and the falling bass lines of minor songs.',
		lessons: []
	},
	{
		id: 'sevenths',
		number: 5,
		name: 'Sevenths & guide tones',
		side: 'jazz',
		after: ['four-chord-loops'],
		summary: 'Four-note chords from the start, the two-five-one, and the two notes that steer it.',
		lessons: ['sevenths-four-sevenths', 'sevenths-two-five-one', 'sevenths-guide-tones', 'sevenths-minor-two-five']
	},
	{
		id: 'jazz-forms',
		number: 6,
		name: 'Jazz forms',
		side: 'jazz',
		after: ['sevenths'],
		summary: 'Turnarounds, the jazz and minor blues, rhythm changes, and tunes that fall in fifths.',
		lessons: []
	},
	{
		id: 'dominants',
		number: 7,
		name: 'Dominants everywhere',
		side: 'jazz',
		after: ['jazz-forms'],
		summary: 'Any chord can have its own five: secondary dominants, tritone substitutes and passing chords.',
		lessons: []
	},
	{
		id: 'colour',
		number: 8,
		name: 'Colour',
		side: 'joined',
		after: ['minor-keys', 'dominants'],
		summary: 'Extensions, altered and suspended dominants, and which scale goes with which chord.',
		lessons: []
	},
	{
		id: 'beyond-function',
		number: 9,
		name: 'Beyond function',
		side: 'joined',
		after: ['colour'],
		summary: 'Harmony that does not pull home: modal vamps, pedal points, chords a third apart.',
		lessons: []
	},
	{
		id: 'changing-key',
		number: 10,
		name: 'Changing key',
		side: 'joined',
		after: ['beyond-function'],
		summary: 'Visiting a key and moving to one: pivot chords, sudden shifts and the lift up a step.',
		lessons: []
	}
];

/** A Sketch groove for trying things: the band at its plainest, bass on the root. */
const TRY_GROOVE: Partial<Groove> = { bass: 'root', bassInstrument: 'upright' };
const ROCK_GROOVE: Partial<Groove> = { pattern: 'strum', bass: 'root', bassInstrument: 'electric', drums: 'rock' };
const POP_GROOVE: Partial<Groove> = { bass: 'root', bassInstrument: 'electric', drums: 'pop' };
const SWING_GROOVE: Partial<Groove> = { bass: 'walking', bassInstrument: 'upright', drums: 'swing' };

const BLUES = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];

export const LESSONS: Lesson[] = [
	// ---- 0 Home ----
	{
		id: 'home-hear-home',
		track: 'home',
		title: 'Hear home',
		skills: ['hear', 'read'],
		items: ['quality-major-minor'],
		steps: [
			{
				kind: 'listen',
				text: 'Four chords, then the first one held. Listen for the moment the music comes to rest.',
				mode: 'major',
				chords: [c(0, '', 2), c(5, '', 2), c(7, '', 2), c(0, '', 2)],
				hold: 4,
				home: true
			},
			{
				kind: 'read',
				text: [
					'The chord it rests on is home, also called the tonic. A key is a home note and the family of notes and chords that gather round it.',
					'Roman numerals count up the scale from home: {I} is home, {IV} and {V} are the chords on its fourth and fifth steps. Capitals mean major chords, small letters minor.'
				]
			},
			{
				kind: 'listen',
				text: 'The same journey in a minor key. Home sounds darker now, but it is still where the music settles.',
				mode: 'minor',
				chords: [c(0, 'm', 2), c(5, 'm', 2), c(7, '', 2), c(0, 'm', 2)],
				hold: 4,
				home: true
			},
			{
				kind: 'read',
				text: [
					'In a minor key home is {i}, written small because the chord is minor. The {V} usually stays major even here: its middle note leans so hard into home that minor keys borrow it.'
				]
			},
			{
				kind: 'quiz',
				item: 'quality-major-minor',
				text: 'One chord at a time, with no key around it. Does it sound major or minor?',
				questions: 4
			}
		]
	},
	{
		id: 'home-chord-colours',
		track: 'home',
		title: 'Chord colours',
		skills: ['hear', 'read'],
		items: ['quality-major-minor', 'quality-triads'],
		steps: [
			{
				kind: 'listen',
				text: 'One root, two chords, back and forth. A single note moves by a half step, and the mood flips with it.',
				mode: 'major',
				chords: [c(0), c(0, 'm'), c(0), c(0, 'm')]
			},
			{
				kind: 'read',
				text: [
					'A triad is three notes stacked in thirds. When the wider third is at the bottom the chord is major; when the narrower one is, it is minor.',
					'In Vamp every chord is printed in the ink of its kind: yellow for major, blue for minor.'
				]
			},
			{
				kind: 'listen',
				text: 'Two rarer kinds between plain major chords: diminished squeezes both thirds narrow and sounds tense, augmented stretches both wide and seems to float.',
				mode: 'major',
				chords: [c(0), c(0, 'dim'), c(0), c(0, 'aug')]
			},
			{
				kind: 'quiz',
				item: 'quality-triads',
				text: 'All four kinds now, one chord at a time. Name the kind you hear.',
				questions: 6
			}
		]
	},

	// ---- 1 Three chords ----
	{
		id: 'three-five-to-one',
		track: 'three-chords',
		title: 'Five to one',
		skills: ['hear', 'read'],
		items: ['fn-three-chords'],
		steps: [
			{
				kind: 'listen',
				text: 'Home, then the chord on the fifth step, then home again. Hear how {V} leans forward, waiting.',
				mode: 'major',
				chords: [c(0), c(7), c(0)],
				hold: 4
			},
			{
				kind: 'read',
				text: [
					'{V} wants to go home more than any other chord. Its middle note sits a half step below the home note and pulls up into it.',
					'That makes {V} to {I} the firmest way to end a phrase: a full stop.'
				]
			},
			{
				kind: 'listen',
				text: 'Now the chord on the fourth step. {IV} to {I} lands as well, but softly.',
				mode: 'major',
				chords: [c(0), c(5), c(0)],
				hold: 4
			},
			{
				kind: 'read',
				text: [
					'{IV} has no note just below home, so {IV} to {I} sounds like settling rather than arriving. It is the amen at the end of a hymn.',
					'It is no lesser ending, though. In one study of a hundred classic rock songs, {I} was reached from {IV} more often than from {V}.'
				]
			},
			{
				kind: 'quiz',
				item: 'fn-three-chords',
				text: 'The key plays first, then three chords. Name each one: {I}, {IV} or {V}.',
				questions: 4
			}
		]
	},
	{
		id: 'three-rock-ending',
		track: 'three-chords',
		title: 'Five, four, one',
		skills: ['hear', 'read', 'use'],
		items: ['fn-three-chords'],
		steps: [
			{
				kind: 'listen',
				text: 'Down from {V} through {IV} to home: an ending you will hear at the close of many choruses.',
				mode: 'major',
				cadence: true,
				chords: [c(7), c(5), c(0)],
				hold: 4
			},
			{
				kind: 'read',
				text: [
					'Some theory books call {V} going to {IV} a wrong turn. Rock and blues have always used it as an ordinary way home.'
				]
			},
			{
				kind: 'listen',
				text: 'Three chords, round and round: {I}, {IV}, {V}, then back through {IV}. Early rock and roll ran on riffs like this.',
				mode: 'major',
				chords: [c(0), c(5), c(7), c(5)],
				passes: 2,
				tempo: 132
			},
			{
				kind: 'quiz',
				item: 'fn-three-chords',
				text: 'The same three chords, in any order. Name each one.',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Loop the riff in Sketch and play along. Then make the last bar a {V} and hear the riff push harder back to the top.',
				song: {
					name: 'Three-chord riff',
					mode: 'major',
					bars: [[c(0)], [c(5)], [c(7)], [c(5)]],
					tempo: 132,
					instrument: 'guitar',
					groove: ROCK_GROOVE
				}
			}
		]
	},
	{
		id: 'three-twelve-bar',
		track: 'three-chords',
		title: 'Twelve-bar blues',
		skills: ['hear', 'read', 'use'],
		items: ['fn-three-chords'],
		steps: [
			{
				kind: 'listen',
				text: 'Twelve bars, three chords. Count the bars as you listen: the changes fall in the same places every time round.',
				mode: 'major',
				chords: BLUES.map((s) => c(s)),
				tempo: 120
			},
			{
				kind: 'read',
				text: [
					'The twelve-bar blues: four bars of {I}, two of {IV}, two of {I}, then {V}, {IV}, {I} and a last {V} that turns the form round to the top.',
					'Blues, rock and roll and a good part of jazz grew out of this one shape.'
				]
			},
			{
				kind: 'listen',
				text: 'Now with sevenths, the way the blues usually plays them: {I7}, {IV7}, {V7}. Every chord gets a rough edge that never quite settles.',
				mode: 'major',
				chords: BLUES.map((s) => c(s, '7')),
				tempo: 120
			},
			{
				kind: 'try',
				text: 'Loop the blues in Sketch and improvise over it. Then try the quick change: make bar 2 a {IV7}.',
				song: {
					name: 'Twelve-bar blues',
					mode: 'major',
					bars: BLUES.map((s) => [c(s, '7')]),
					tempo: 120,
					groove: SWING_GROOVE
				}
			}
		]
	},

	// ---- 2 Four-chord loops ----
	{
		id: 'loops-minor-six',
		track: 'four-chord-loops',
		title: 'The minor six',
		skills: ['hear', 'read'],
		items: ['fn-four-chords'],
		steps: [
			{
				kind: 'listen',
				text: 'Home, then the minor chord on the sixth step, back and forth. The same key, with a shadow passing over.',
				mode: 'major',
				chords: [c(0), c(9, 'm'), c(0), c(9, 'm')]
			},
			{
				kind: 'read',
				text: [
					'{vi} shares two of its three notes with {I}, so it can stand in for home without quite being home.',
					'It is the minor chord pop reaches for most, and the one that turns three chords into four.'
				]
			},
			{
				kind: 'listen',
				text: '{V} sets up the return home, and {vi} arrives instead. The surprise is called a deceptive cadence.',
				mode: 'major',
				chords: [c(0), c(5), c(7), c(9, 'm')],
				hold: 4
			},
			{
				kind: 'quiz',
				item: 'fn-four-chords',
				text: 'Four chords now. Name each one after the key has played.',
				questions: 4
			}
		]
	},
	{
		id: 'loops-axis',
		track: 'four-chord-loops',
		title: 'The Axis',
		skills: ['hear', 'read', 'use'],
		items: ['loop-pop'],
		steps: [
			{
				kind: 'listen',
				text: 'Four chords on repeat: {I}, {V}, {vi}, {IV}. Home comes first, the minor chord third.',
				mode: 'major',
				loop: 'axis'
			},
			{
				kind: 'listen',
				text: 'The same four chords, started on {vi}. Nothing else has changed, and yet it sounds like a minor song.',
				mode: 'major',
				cadence: true,
				loop: 'axis-vi'
			},
			{
				kind: 'read',
				text: [
					'A loop has no fixed start, so the chord you begin on sets the mood. Begun on {I} it sounds settled and bright; begun on {vi} it sounds wistful, and home only arrives third.',
					'This loop is often called the Axis. You know it from “Let It Be”, among a great many others.'
				]
			},
			{
				kind: 'quiz',
				item: 'loop-pop',
				text: 'Pop loops, each played twice. Which one is it?',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Play the loop in Sketch. Then rotate it so it starts on {vi}, and listen to the mood turn.',
				song: {
					name: 'The Axis',
					mode: 'major',
					bars: [[c(0)], [c(7)], [c(9, 'm')], [c(5)]],
					tempo: 96,
					groove: POP_GROOVE
				}
			}
		]
	},
	{
		id: 'loops-reordered',
		track: 'four-chord-loops',
		title: 'Same chords, new order',
		skills: ['hear', 'read', 'use'],
		items: ['loop-pop'],
		steps: [
			{
				kind: 'listen',
				text: '{I}, straight down to {vi}, then {IV} and {V} climb back up. The fifties in four chords.',
				mode: 'major',
				loop: 'doowop'
			},
			{
				kind: 'listen',
				text: '{IV}, {V}, {vi}, and home only at the end: this loop takes three chords to get there.',
				mode: 'major',
				cadence: true,
				loop: 'hopscotch'
			},
			{
				kind: 'read',
				text: [
					'Both loops use the Axis chords in another order. The first is the doo-wop loop of “Stand By Me”; the second is newer, and called hopscotch.',
					'The order decides where a loop leans. Ending on {V} pushes it back to the top; ending on {I} lets it rest before it starts again.'
				]
			},
			{
				kind: 'quiz',
				item: 'loop-pop',
				text: 'The pop loops again, mixed. Which one is it?',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Play the doo-wop loop in Sketch, then change the {IV} to a {ii}: the jazz cousin of the same loop, called a turnaround.',
				song: {
					name: 'Doo-wop loop',
					mode: 'major',
					bars: [[c(0)], [c(9, 'm')], [c(5)], [c(7)]],
					tempo: 84,
					groove: { pattern: 'arpeggio', bass: 'root', bassInstrument: 'upright' }
				}
			}
		]
	},

	// ---- 3 Borrowed chords (pop & rock) ----
	{
		id: 'borrowed-flat-seven',
		track: 'borrowed',
		title: 'The flat seven',
		skills: ['hear', 'read', 'use'],
		items: ['fn-rock-chords'],
		steps: [
			{
				kind: 'listen',
				text: 'Home, then a major chord a whole step below it, then home. That middle chord is not in the major key at all.',
				mode: 'major',
				chords: [c(0), c(10), c(0)],
				hold: 4
			},
			{
				kind: 'read',
				text: [
					'{bVII} comes from the minor key on the same home note; a chord taken that way is called borrowed.',
					'Rock treats it as a basic chord. In one study of a hundred classic rock songs it turned up in about as many songs as {ii} did.'
				]
			},
			{
				kind: 'listen',
				text: '{I}, {bVII}, {IV}: a whole riff, and the five chord never comes.',
				mode: 'major',
				loop: 'mixolydian'
			},
			{
				kind: 'quiz',
				item: 'fn-rock-chords',
				text: 'Home, {IV}, {V} and {bVII}, after the key. Name each one.',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Loop the riff in Sketch and play the major scale over it. Then lower the scale’s seventh note to match the {bVII}: that scale is the Mixolydian mode.',
				song: {
					name: 'Flat-seven riff',
					mode: 'major',
					bars: [[c(0)], [c(10)], [c(5)], [c(0)]],
					tempo: 112,
					instrument: 'guitar',
					groove: ROCK_GROOVE
				}
			}
		]
	},
	{
		id: 'borrowed-climbing-home',
		track: 'borrowed',
		title: 'Climbing home',
		skills: ['hear', 'read'],
		items: ['loop-rock'],
		steps: [
			{
				kind: 'listen',
				text: 'Two borrowed chords climbing a whole step at a time, {bVI} and {bVII}, and then home.',
				mode: 'major',
				cadence: true,
				loop: 'mario'
			},
			{
				kind: 'read',
				text: [
					'{bVI} and {bVII} both come from the minor key. Rising through them to {I} sounds triumphant rather than resolved: the sound of a level cleared in a video game, or the last chorus of a power ballad.'
				]
			},
			{
				kind: 'listen',
				text: 'Now from a minor home: {i}, {bVI}, {bIII}, {bVII}. Three big major chords around a dark centre.',
				mode: 'minor',
				loop: 'epic'
			},
			{
				kind: 'read',
				text: [
					'Those are the Axis chords again, heard from their minor one. Started there, the bright pop loop turns into something for film scores and stadiums.'
				]
			},
			{
				kind: 'quiz',
				item: 'loop-rock',
				text: 'Loops with borrowed chords, in major and minor. Which one is it?',
				questions: 4
			}
		]
	},
	{
		id: 'borrowed-minor-four',
		track: 'borrowed',
		title: 'The minor four',
		skills: ['hear', 'read', 'use'],
		items: ['fn-borrowed'],
		steps: [
			{
				kind: 'listen',
				text: 'Home, {IV}, then the same chord turned minor, then home. Listen for the sigh in the third chord.',
				mode: 'major',
				chords: [c(0), c(5), c(5, 'm'), c(0)],
				hold: 4
			},
			{
				kind: 'read',
				text: [
					'{iv} borrows a single note from the minor key: the middle note of {IV} drops a half step. On the way home it falls one more half step and lands inside the home chord.'
				]
			},
			{
				kind: 'listen',
				text: '{iv} straight to {I}: the amen at the end of a hymn, with a shadow over it.',
				mode: 'major',
				cadence: true,
				chords: [c(5, 'm'), c(0)],
				hold: 4
			},
			{
				kind: 'quiz',
				item: 'fn-borrowed',
				text: 'The borrowed chords so far, mixed in with the key’s own. Name each one.',
				questions: 4
			},
			{
				kind: 'try',
				text: 'In Sketch, move the {iv} around: just before a {V}, or as the last chord before the loop starts again.',
				song: {
					name: 'Minor four',
					mode: 'major',
					bars: [[c(0)], [c(5)], [c(5, 'm')], [c(0)]],
					tempo: 76,
					groove: { pattern: 'arpeggio', bass: 'root', bassInstrument: 'upright' }
				}
			}
		]
	},

	// ---- 5 Sevenths & guide tones (jazz) ----
	{
		id: 'sevenths-four-sevenths',
		track: 'sevenths',
		title: 'Four sevenths',
		skills: ['hear', 'read'],
		items: ['quality-sevenths'],
		steps: [
			{
				kind: 'listen',
				text: 'One root, four seventh chords. Each is a triad with one more note on top.',
				mode: 'major',
				chords: [c(0, 'maj7'), c(0, '7'), c(0, 'm7'), c(0, 'm7b5')]
			},
			{
				kind: 'read',
				text: [
					'A seventh chord stacks one more third on a triad. Major seventh sounds lush and still, dominant seventh restless, minor seventh soft, half-diminished dark and unsettled.',
					'About three in four chords in jazz tunes are sevenths, which is why the jazz side starts here.'
				]
			},
			{
				kind: 'listen',
				text: 'Every chord of a major key as a seventh, from home up the scale and back.',
				mode: 'major',
				chords: [
					c(0, 'maj7', 2),
					c(2, 'm7', 2),
					c(4, 'm7', 2),
					c(5, 'maj7', 2),
					c(7, '7', 2),
					c(9, 'm7', 2),
					c(11, 'm7b5', 2),
					c(0, 'maj7', 2)
				],
				hold: 4
			},
			{
				kind: 'read',
				text: [
					'Each step of the scale has its own kind: major sevenths on {I} and {IV}, the only dominant seventh on {V}, minor sevenths on {ii}, {iii} and {vi}, and a half-diminished {viiø7}.'
				]
			},
			{
				kind: 'quiz',
				item: 'quality-sevenths',
				text: 'One seventh chord at a time, no key. Name its kind.',
				questions: 6
			}
		]
	},
	{
		id: 'sevenths-two-five-one',
		track: 'sevenths',
		title: 'Two, five, one',
		skills: ['hear', 'read', 'use'],
		items: ['fn-sevenths'],
		steps: [
			{
				kind: 'listen',
				text: 'A minor seventh, a dominant seventh, then home on a major seventh.',
				mode: 'major',
				cadence: true,
				loop: 'jazz-251'
			},
			{
				kind: 'read',
				text: [
					'The roots fall by fifths, from {ii7} to {V7} to {Imaj7}. It is the basic sentence of jazz: many standards are chains of it, moving from one key to the next.'
				]
			},
			{
				kind: 'listen',
				text: 'Put {vi7} in front and the move loops: {Imaj7}, {vi7}, {ii7}, {V7}, and round again. Tunes use it to end one chorus and begin the next.',
				mode: 'major',
				loop: 'turnaround'
			},
			{
				kind: 'quiz',
				item: 'fn-sevenths',
				text: 'The sevenths of a major key, after the key has played. Name each one.',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Loop it in Sketch and play each chord’s root, then its third, then its seventh. Before long your line will outline the chords on its own.',
				song: {
					name: 'Two, five, one',
					mode: 'major',
					bars: [[c(2, 'm7')], [c(7, '7')], [c(0, 'maj7')], [c(0, 'maj7')]],
					tempo: 120,
					groove: SWING_GROOVE
				}
			}
		]
	},
	{
		id: 'sevenths-guide-tones',
		track: 'sevenths',
		title: 'Guide tones',
		skills: ['hear', 'read', 'play'],
		items: ['loop-jazz'],
		steps: [
			{
				kind: 'listen',
				text: 'A two-five-one, slowly. Listen inside the chords: at each change one note slips down a half step while another holds still.',
				mode: 'major',
				loop: 'jazz-251',
				cadence: true,
				tempo: 72
			},
			{
				kind: 'read',
				text: [
					'In a seventh chord the third and the seventh decide its kind; the root and fifth mostly hold it up. Players call those two notes guide tones.',
					'The seventh of {ii7} falls a half step to become the third of {V7}, and the seventh of {V7} falls to the third of {Imaj7}. Two notes, barely moving, carry the whole progression.'
				]
			},
			{
				kind: 'quiz',
				item: 'loop-jazz',
				text: 'Jazz loops in sevenths, each played twice. Which one is it?',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Put these chords in Sketch, then open Practice and pick a guide-tone drill: it walks the thirds and sevenths through them, in any key. A solo that follows them sounds like the chords.',
				song: {
					name: 'Guide tones',
					mode: 'major',
					bars: [[c(2, 'm7')], [c(7, '7')], [c(0, 'maj7')], [c(0, 'maj7')]],
					tempo: 100,
					groove: TRY_GROOVE
				}
			}
		]
	},
	{
		id: 'sevenths-minor-two-five',
		track: 'sevenths',
		title: 'Minor two, five, one',
		skills: ['hear', 'read', 'use'],
		items: ['fn-minor-sevenths'],
		steps: [
			{
				kind: 'listen',
				text: 'The minor version: half-diminished, then dominant, then home on a minor seventh.',
				mode: 'minor',
				cadence: true,
				loop: 'minor-251'
			},
			{
				kind: 'read',
				text: [
					'In a minor key the two chord is half-diminished, {iiø7}. The {V7} takes a raised note from the harmonic minor scale, so it pulls home as hard as it does in major.'
				]
			},
			{
				kind: 'quiz',
				item: 'fn-minor-sevenths',
				text: 'Sevenths in a minor key, after the key has played. Name each one.',
				questions: 4
			},
			{
				kind: 'try',
				text: 'Loop it in Sketch with a bossa groove and improvise. Over the {V7}, try the note a half step above its root: it gives the minor key its bite.',
				song: {
					name: 'Minor two, five, one',
					mode: 'minor',
					bars: [[c(2, 'm7b5')], [c(7, '7')], [c(0, 'm7')], [c(0, 'm7')]],
					tempo: 120,
					groove: { pattern: 'block', bass: 'root', bassInstrument: 'upright', drums: 'bossa' }
				}
			}
		]
	}
];

// ---- lookups -----------------------------------------------------------------

const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]));
const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));

export function trackById(id: string): Track | null {
	return TRACK_BY_ID.get(id as TrackId) ?? null;
}

export function lessonById(id: string): Lesson | null {
	return LESSON_BY_ID.get(id) ?? null;
}

/** A track's lessons, in order. */
export function lessonsOf(track: Track): Lesson[] {
	return track.lessons.flatMap((id) => LESSON_BY_ID.get(id) ?? []);
}

/** Every lesson in map order: tracks by number, lessons in their track's order. */
export const MAP_ORDER: Lesson[] = [...TRACKS].sort((a, b) => a.number - b.number).flatMap(lessonsOf);

/** "1.2": the track's number, then the lesson's place in it. */
export function lessonNumber(lesson: Lesson): string {
	const track = TRACK_BY_ID.get(lesson.track);
	return track ? `${track.number}.${track.lessons.indexOf(lesson.id) + 1}` : '';
}

/** The lesson after this one in map order, or null at the end. */
export function lessonAfter(lesson: Lesson): Lesson | null {
	const i = MAP_ORDER.indexOf(lesson);
	return i >= 0 ? (MAP_ORDER[i + 1] ?? null) : null;
}

// ---- text --------------------------------------------------------------------

const NUMERAL_IN_TEXT = /\{([^{}]+)\}/g;

/** Text with numerals in braces → parts for the UI ('{IV} to {I}' → numeral, ' to ', numeral). */
export function textParts(text: string): Part[] {
	const parts: Part[] = [];
	let last = 0;
	for (const m of text.matchAll(NUMERAL_IN_TEXT)) {
		if (m.index > last) parts.push(text.slice(last, m.index));
		parts.push({ numeral: m[1] });
		last = m.index + m[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}

/** The numerals written in a text, in order. */
export function textNumerals(text: string): string[] {
	return [...text.matchAll(NUMERAL_IN_TEXT)].map((m) => m[1]);
}

/** Every text of a step, for the word cap and the numeral checks. */
export function stepTexts(step: LessonStep): string[] {
	return step.kind === 'read' ? step.text : [step.text];
}

// ---- music -------------------------------------------------------------------

/** The key a step plays in: the lesson's tonic, spelled as that mode writes it. */
export function stepKey(mode: Mode, tonic: string): KeyInfo {
	return { tonic: spellKey(tonic, mode), mode };
}

/** A bar per chord unless the lesson says otherwise. */
export const LISTEN_BEATS = 4;
/** A loop is heard twice, so it sounds like a loop. */
export const LOOP_PASSES = 2;

/** A listen step ready to play: its chips, and how a cue maps onto them. */
export interface ListenPassage {
	key: KeyInfo;
	/** Concert symbols, one chip each. */
	chords: string[];
	numerals: string[];
	run: LearnRun;
	/** Section index of the passage itself (after the cadence, if any). */
	passage: number;
	/** Section index of the held last chord, or null. */
	hold: number | null;
}

/** The step's chords as degree + quality, from its loop or its own list. */
function stepChords(step: ListenStep): LessonChord[] {
	if (step.loop) return loopById(step.loop)?.chords ?? [];
	return step.chords ?? [];
}

export function listenPassage(step: ListenStep, tonic: string): ListenPassage {
	const key = stepKey(step.mode, tonic);
	const degrees = stepChords(step);
	// A loop's chords build exactly like a preset's (buildLoop), so one path serves both.
	const chords = degrees.map((d) => buildPresetChord(key.tonic, d));
	const sections: LearnSection[] = step.cadence ? cadenceSections(key) : [];
	const passage = sections.length;
	sections.push({
		role: 'listen',
		chords: chords.map((symbol, i) => ({ symbol, beats: degrees[i]?.beats ?? LISTEN_BEATS })),
		passes: step.passes ?? (step.loop ? LOOP_PASSES : 1)
	});
	let hold: number | null = null;
	if (step.hold && step.hold > 0 && chords.length > 0) {
		hold = sections.length;
		sections.push({ role: 'listen', chords: [{ symbol: chords[chords.length - 1], beats: step.hold }] });
	}
	return {
		key,
		chords,
		numerals: chords.map((symbol) => numeralOf(symbol, key)),
		run: learnPlan(sections, { tempo: step.tempo ?? LEARN_TEMPO }),
		passage,
		hold
	};
}

/** Which chip a cue lights: the passage's chord, the last chip while it is held, else none. */
export function chipFor(p: Pick<ListenPassage, 'chords' | 'passage' | 'hold'>, cue: LearnCue | null): number | null {
	if (!cue || cue.chord === null) return null;
	if (cue.section === p.passage) return cue.chord;
	if (cue.section === p.hold) return p.chords.length - 1;
	return null;
}

/** One chord on its own, a bar long (a tapped chip). */
export function chordRun(symbol: string): LearnRun {
	return learnPlan([{ role: 'listen', chords: [{ symbol, beats: LISTEN_BEATS }] }]);
}

/** The concert chords of a try-song's bars in a key, for a preview. */
export function trySongChords(song: TrySong, tonic: string): string[][] {
	const key = stepKey(song.mode, tonic);
	return song.bars.map((bar) => bar.map((d) => buildPresetChord(key.tonic, d)));
}

/**
 * A try-song as a Sketch Progression in a key (factory helpers, fresh ids):
 * each bar's chords share it evenly, an empty bar is a rest. Named after the
 * song and the key, like a preset applied in a root.
 */
export function buildTrySong(song: TrySong, tonic: string): Progression {
	const key = stepKey(song.mode, tonic);
	const ts = DEFAULT_TIME_SIGNATURE;
	const bars = trySongChords(song, tonic).map((chords) =>
		chords.length === 0
			? createBar(ts)
			: createBar(
					ts,
					chords.map((symbol) => createSlot(symbol, barBeats(ts) / chords.length))
				)
	);
	return createProgression({
		name: `${song.name} in ${key.tonic}${key.mode === 'minor' ? ' minor' : ''}`,
		tempo: song.tempo,
		timeSignature: ts,
		instrument: song.instrument ?? 'piano',
		groove: { ...DEFAULT_GROOVE, ...song.groove },
		bars
	});
}

// ---- progress ----------------------------------------------------------------

export function lessonState(p: LessonProgress | undefined): LessonState {
	if (!p) return 'new';
	if (p.done > 0) return 'done';
	return p.step > 0 ? 'started' : 'new';
}

/** How many of a track's lessons are done. */
export function trackDone(track: Track, progress: Record<string, LessonProgress>): number {
	return track.lessons.filter((id) => lessonState(progress[id]) === 'done').length;
}

const own = (progress: Record<string, LessonProgress>, id: string): LessonProgress | undefined =>
	Object.prototype.hasOwnProperty.call(progress, id) ? progress[id] : undefined;

/**
 * The lesson to suggest next, or null when every lesson is done:
 * 1. one you started and haven't finished;
 * 2. the next one in the track you last finished a lesson in;
 * 3. the first one in a track that follows that track (your side of the fork);
 * 4. the first one in a track whose suggested-before tracks are all done;
 * 5. the first unfinished one on the map.
 */
export function nextLesson(progress: Record<string, LessonProgress>): Lesson | null {
	const open = MAP_ORDER.filter((l) => lessonState(own(progress, l.id)) !== 'done');
	if (open.length === 0) return null;

	const started = open.find((l) => lessonState(own(progress, l.id)) === 'started');
	if (started) return started;

	let latest: Lesson | null = null;
	let latestAt = 0;
	for (const l of MAP_ORDER) {
		const at = own(progress, l.id)?.done ?? 0;
		if (at > latestAt) {
			latest = l;
			latestAt = at;
		}
	}
	if (latest) {
		const sameTrack = open.find((l) => l.track === latest.track);
		if (sameTrack) return sameTrack;
		const follows = open.find((l) => trackById(l.track)?.after.includes(latest.track));
		if (follows) return follows;
	}

	const trackComplete = (id: TrackId) => {
		const t = TRACK_BY_ID.get(id);
		return !!t && t.lessons.length > 0 && trackDone(t, progress) === t.lessons.length;
	};
	const ready = open.find((l) => (trackById(l.track)?.after ?? []).every(trackComplete));
	return ready ?? open[0];
}
