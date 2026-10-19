import { describe, it, expect } from 'vitest';
import { isValidChordSymbol } from '$lib/audio/chord';
import { barBeats } from '$lib/model/time';
import { plainText } from '$lib/model/harmony';
import { parseNumeral } from '$lib/model/numerals';
import { TEMPO_MAX, TEMPO_MIN } from '$lib/model/factory';
import { migrateProgression } from '$lib/storage/db';
import {
	buildTrySong,
	chipFor,
	lessonAfter,
	lessonById,
	lessonNumber,
	lessonState,
	lessonsOf,
	listenPassage,
	LESSONS,
	MAP_ORDER,
	nextLesson,
	stepTexts,
	textNumerals,
	textParts,
	trackById,
	TRACKS,
	type LessonProgress,
	type ListenStep,
	type TrackId,
	type TryStep
} from './curriculum';
import { quizItemById } from './items';
import { KEY_ROOTS } from './keys';
import { loopById } from './loops';

// Progress in `vamp:learn` is keyed by these. Adding a lesson is fine; renaming
// or removing one orphans everyone's progress — so this list only grows.
const SHIPPED_LESSON_IDS = [
	'home-hear-home',
	'home-chord-colours',
	'three-five-to-one',
	'three-rock-ending',
	'three-twelve-bar',
	'loops-minor-six',
	'loops-axis',
	'loops-reordered',
	'borrowed-flat-seven',
	'borrowed-climbing-home',
	'borrowed-minor-four',
	'sevenths-four-sevenths',
	'sevenths-two-five-one',
	'sevenths-guide-tones',
	'sevenths-minor-two-five'
];

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const words = (text: string) => plainText(textParts(text)).split(/\s+/).filter(Boolean).length;

const steps = <K extends string>(kind: K) =>
	LESSONS.flatMap((lesson) =>
		lesson.steps.flatMap((step, i) => (step.kind === kind ? [{ lesson, step, at: `${lesson.id} step ${i + 1}` }] : []))
	);
const listens = steps('listen') as { lesson: (typeof LESSONS)[number]; step: ListenStep; at: string }[];
const tries = steps('try') as { lesson: (typeof LESSONS)[number]; step: TryStep; at: string }[];

describe('ids', () => {
	it('keeps every shipped lesson id', () => {
		const ids = LESSONS.map((l) => l.id);
		for (const id of SHIPPED_LESSON_IDS) expect(ids, id).toContain(id);
	});

	it('tracks and lessons have unique, storage-safe ids', () => {
		const lessonIds = LESSONS.map((l) => l.id);
		expect(new Set(lessonIds).size).toBe(lessonIds.length);
		for (const id of lessonIds) expect(id).toMatch(ID_RE);
		const trackIds = TRACKS.map((t) => t.id);
		expect(new Set(trackIds).size).toBe(trackIds.length);
		expect(lessonById('nope')).toBeNull();
		expect(trackById('nope')).toBeNull();
	});

	it('numbers the ten tracks 0–10, once each', () => {
		expect(TRACKS.map((t) => t.number).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});
});

describe('tracks', () => {
	it('list each lesson exactly once, in the lesson’s own track', () => {
		const listed = TRACKS.flatMap((t) => t.lessons.map((id) => ({ id, track: t.id })));
		expect(listed.map((x) => x.id).sort()).toEqual(LESSONS.map((l) => l.id).sort());
		for (const { id, track } of listed) expect(lessonById(id)?.track, id).toBe(track);
		expect(MAP_ORDER).toHaveLength(LESSONS.length);
	});

	it('build the shared start and the first track of each side; the rest come later', () => {
		const built = TRACKS.filter((t) => t.lessons.length > 0).map((t) => t.id);
		expect(built).toEqual(['home', 'three-chords', 'four-chord-loops', 'borrowed', 'sevenths']);
	});

	it('fork after the loops and join again', () => {
		const side = (s: string) => TRACKS.filter((t) => t.side === s).map((t) => t.number);
		expect(side('shared')).toEqual([0, 1, 2]);
		expect(side('pop')).toEqual([3, 4]);
		expect(side('jazz')).toEqual([5, 6, 7]);
		expect(side('joined')).toEqual([8, 9, 10]);
		expect(trackById('borrowed')!.after).toEqual(['four-chord-loops']);
		expect(trackById('sevenths')!.after).toEqual(['four-chord-loops']);
		expect(trackById('colour')!.after.sort()).toEqual(['dominants', 'minor-keys']);
	});

	it('suggest an order with no cycles, through tracks that exist', () => {
		const ids = new Set(TRACKS.map((t) => t.id));
		for (const t of TRACKS) for (const a of t.after) expect(ids.has(a), `${t.id} after ${a}`).toBe(true);
		// Depth-first: a track met again on its own path is a cycle.
		const state = new Map<TrackId, 'visiting' | 'done'>();
		const visit = (id: TrackId, path: TrackId[]) => {
			if (state.get(id) === 'done') return;
			expect(state.get(id), `cycle: ${[...path, id].join(' → ')}`).not.toBe('visiting');
			state.set(id, 'visiting');
			for (const a of trackById(id)!.after) visit(a, [...path, id]);
			state.set(id, 'done');
		};
		for (const t of TRACKS) visit(t.id, []);
		// Only the first track has no suggestion before it.
		expect(TRACKS.filter((t) => t.after.length === 0).map((t) => t.id)).toEqual(['home']);
	});

	it('summaries are words only', () => {
		for (const t of TRACKS) {
			expect(t.summary.length, t.id).toBeGreaterThan(0);
			expect(t.summary, t.id).not.toMatch(/[{}]|\b[ivIV]+\b|[♭♯]/);
		}
	});
});

describe('lessons', () => {
	it('titles are names without numerals (set in the display face)', () => {
		for (const l of LESSONS) {
			expect(l.title.trim().length, l.id).toBeGreaterThan(0);
			expect(l.title, l.id).not.toMatch(/[{}]|\b[ivIV]+\b|[♭♯]/);
			expect(l.skills.length, l.id).toBeGreaterThan(0);
		}
	});

	it('start with sound: the first step of every lesson is a listen step', () => {
		for (const l of LESSONS) expect(l.steps[0]?.kind, l.id).toBe('listen');
	});

	it('refer only to quiz items and loops that exist', () => {
		for (const l of LESSONS) {
			for (const id of l.items) expect(quizItemById(id), `${l.id}: ${id}`).not.toBeNull();
			for (const step of l.steps) {
				if (step.kind === 'quiz') {
					expect(quizItemById(step.item), `${l.id}: ${step.item}`).not.toBeNull();
					expect(l.items, `${l.id} enrols what it quizzes`).toContain(step.item);
					expect(step.questions).toBeGreaterThanOrEqual(1);
				}
				if (step.kind === 'listen') {
					expect(!!step.loop !== !!step.chords?.length, `${l.id}: a loop or chords, not both`).toBe(true);
					if (step.loop) expect(loopById(step.loop), `${l.id}: ${step.loop}`).not.toBeNull();
				}
			}
		}
	});

	it('keep every text short: a read step ≤ 70 words, any other ≤ 40', () => {
		for (const l of LESSONS) {
			l.steps.forEach((step, i) => {
				const total = stepTexts(step).reduce((n, t) => n + words(t), 0);
				expect(total, `${l.id} step ${i + 1}`).toBeGreaterThan(0);
				expect(total, `${l.id} step ${i + 1}`).toBeLessThanOrEqual(step.kind === 'read' ? 70 : 40);
			});
		}
	});

	it('write every numeral in text in the chart’s convention', () => {
		for (const l of LESSONS) {
			for (const step of l.steps) {
				for (const text of stepTexts(step)) {
					for (const n of textNumerals(text)) expect(parseNumeral(n), `${l.id}: {${n}}`).not.toBeNull();
					// A brace that didn't close would show up as text.
					expect(plainText(textParts(text)), `${l.id}`).not.toMatch(/[{}]/);
				}
			}
		}
	});
});

describe('listen steps', () => {
	it('build a play-once Learn plan in all 12 roots, with valid chords and the same numerals', () => {
		for (const { step, at } of listens) {
			const reference = listenPassage(step, KEY_ROOTS[step.mode][0]).numerals;
			for (const tonic of KEY_ROOTS[step.mode]) {
				const p = listenPassage(step, tonic);
				expect(p.chords.length, at).toBeGreaterThan(0);
				for (const symbol of p.chords) expect(isValidChordSymbol(symbol), `${at} in ${tonic}: ${symbol}`).toBe(true);
				expect(p.numerals, `${at} in ${tonic}`).toEqual(reference);
				expect(p.run.plan.source).toBe('learn');
				expect(p.run.plan.loop).toBe(false);
				expect(p.run.plan.mix).toBe('full');
				const chordEvents = p.run.plan.events.filter((e) => e.kind === 'chord' && e.midi.length > 0);
				expect(chordEvents.length, at).toBeGreaterThan(0);
				// Every event lights the cue channel, never the editor's.
				for (const e of p.run.plan.events) expect(e.slotIndex ?? null).toBeNull();
				// Every sounding cue maps to a chip; the cadence and filler rests to none.
				p.run.cues.forEach((cue) => {
					const chip = chipFor(p, cue);
					if (chip !== null) expect(chip, at).toBeLessThan(p.chords.length);
					if (cue.section === p.passage && cue.chord !== null) expect(chip, at).toBe(cue.chord);
				});
			}
		}
	});

	it('only name numerals the passage plays', () => {
		for (const { step, at } of listens) {
			const played = new Set(listenPassage(step, KEY_ROOTS[step.mode][0]).numerals);
			for (const n of textNumerals(step.text)) expect(played.has(n), `${at}: {${n}} is not played`).toBe(true);
		}
	});

	it('hold the last chord on its own section, lit on the last chip', () => {
		const held = listens.find(({ step }) => step.hold)!;
		const p = listenPassage(held.step, 'C');
		expect(p.hold).toBe(p.passage + 1);
		expect(chipFor(p, { section: p.hold!, chord: 0, pass: 0 })).toBe(p.chords.length - 1);
		expect(chipFor(p, null)).toBeNull();
	});

	it('set the key first when asked', () => {
		const withCadence = listens.find(({ step }) => step.cadence)!;
		const p = listenPassage(withCadence.step, 'C');
		expect(p.passage).toBe(2); // prefix, gap, then the passage
		expect(p.run.sections.map((s) => s.role).slice(0, 2)).toEqual(['prefix', 'gap']);
		expect(chipFor(p, { section: 0, chord: 0, pass: 0 })).toBeNull();
	});

	it('Hear home is the first lesson, and plays I–IV–V–I with home held', () => {
		const first = MAP_ORDER[0];
		expect(first.id).toBe('home-hear-home');
		const step = first.steps[0] as ListenStep;
		const p = listenPassage(step, 'C');
		expect(p.chords).toEqual(['C', 'F', 'G', 'C']);
		expect(p.numerals).toEqual(['I', 'IV', 'V', 'I']);
		expect(step.home).toBe(true);
		const minor = listenPassage(first.steps[2] as ListenStep, 'C');
		expect(minor.numerals).toEqual(['i', 'iv', 'V', 'i']);
	});
});

describe('try steps', () => {
	it('build a Sketch song that survives migrateProgression, in all 12 roots', () => {
		for (const { step, at } of tries) {
			for (const tonic of KEY_ROOTS[step.song.mode]) {
				const song = buildTrySong(step.song, tonic);
				const back = migrateProgression(JSON.parse(JSON.stringify(song)));
				expect(back, `${at} in ${tonic}`).toEqual(song);
				expect(song.name, at).toMatch(/ in [A-G][b#]?( minor)?$/);
				expect(song.tempo).toBeGreaterThanOrEqual(TEMPO_MIN);
				expect(song.tempo).toBeLessThanOrEqual(TEMPO_MAX);
				expect(song.bars).toHaveLength(step.song.bars.length);
				for (const bar of song.bars) {
					expect(bar.slots.reduce((n, s) => n + s.beats, 0)).toBe(barBeats(song.timeSignature));
					for (const slot of bar.slots) {
						if (slot.chord) expect(isValidChordSymbol(slot.chord), `${at} in ${tonic}: ${slot.chord}`).toBe(true);
					}
				}
			}
		}
	});

	it('name the sketch after the song and its key', () => {
		const axis = tries.find(({ lesson }) => lesson.id === 'loops-axis')!;
		expect(buildTrySong(axis.step.song, 'Eb').name).toBe('The Axis in Eb');
		expect(buildTrySong(axis.step.song, 'Eb').bars.map((b) => b.slots[0].chord)).toEqual(['Eb', 'Bb', 'Cm', 'Ab']);
		const minor = tries.find(({ step }) => step.song.mode === 'minor')!;
		expect(buildTrySong(minor.step.song, 'Db').name).toMatch(/ in C# minor$/);
	});

	it('give every sketch fresh ids', () => {
		const { step } = tries[0];
		const a = buildTrySong(step.song, 'C');
		const b = buildTrySong(step.song, 'C');
		expect(a.id).not.toBe(b.id);
		expect(a.bars[0].id).not.toBe(b.bars[0].id);
	});
});

describe('text', () => {
	it('splits numerals out of a sentence', () => {
		expect(textParts('{IV} to {I}, softly.')).toEqual([{ numeral: 'IV' }, ' to ', { numeral: 'I' }, ', softly.']);
		expect(textParts('No numerals here.')).toEqual(['No numerals here.']);
		expect(textNumerals('{ii7} then {V7}')).toEqual(['ii7', 'V7']);
	});
});

describe('order and progress', () => {
	const done = (at: number): LessonProgress => ({ step: 0, done: at });

	it('numbers lessons by track', () => {
		expect(lessonNumber(lessonById('home-hear-home')!)).toBe('0.1');
		expect(lessonNumber(lessonById('sevenths-two-five-one')!)).toBe('5.2');
		expect(lessonsOf(trackById('borrowed')!).map((l) => l.id)).toEqual(trackById('borrowed')!.lessons);
		expect(lessonAfter(MAP_ORDER[0])).toBe(MAP_ORDER[1]);
		expect(lessonAfter(MAP_ORDER[MAP_ORDER.length - 1])).toBeNull();
	});

	it('reads a lesson’s state', () => {
		expect(lessonState(undefined)).toBe('new');
		expect(lessonState({ step: 0, done: 0 })).toBe('new');
		expect(lessonState({ step: 2, done: 0 })).toBe('started');
		expect(lessonState({ step: 0, done: 5 })).toBe('done');
	});

	it('suggests Hear home first, then the next lesson in the track', () => {
		expect(nextLesson({})?.id).toBe('home-hear-home');
		expect(nextLesson({ 'home-hear-home': done(1) })?.id).toBe('home-chord-colours');
	});

	it('suggests a started lesson before anything else', () => {
		expect(nextLesson({ 'home-hear-home': done(1), 'loops-axis': { step: 2, done: 0 } })?.id).toBe('loops-axis');
	});

	it('follows your side of the fork', () => {
		const shared = Object.fromEntries(
			['home', 'three-chords', 'four-chord-loops'].flatMap((t) => trackById(t)!.lessons.map((id, i) => [id, done(1 + i)]))
		);
		// Finished the shared start: the first track after it, pop/rock by number.
		expect(nextLesson(shared)?.id).toBe('borrowed-flat-seven');
		// Took the jazz side: stay on it.
		expect(nextLesson({ ...shared, 'sevenths-four-sevenths': done(100) })?.id).toBe('sevenths-two-five-one');
		// Finished a whole side: the other side is the only one left.
		const jazz = Object.fromEntries(trackById('sevenths')!.lessons.map((id, i) => [id, done(200 + i)]));
		expect(nextLesson({ ...shared, ...jazz })?.id).toBe('borrowed-flat-seven');
	});

	it('suggests nothing once every lesson is done, and ignores inherited keys', () => {
		expect(nextLesson(Object.fromEntries(LESSONS.map((l) => [l.id, done(1)])))).toBeNull();
		const hostile = JSON.parse('{"__proto__": {"step": 3, "done": 0}}');
		expect(nextLesson(hostile)?.id).toBe('home-hear-home');
	});
});
