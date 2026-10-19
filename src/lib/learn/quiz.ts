// Ear-quiz questions: generated from a quiz item (items.ts) with an injected
// `rand`, so a seed always gives the same question.
//
// Rules every generator keeps (quiz.test.ts sweeps them):
// - answers are COMPUTED from the chords played (numeralOf), never typed, and
//   the answer pad is computed the same way, so the right button always exists;
// - every symbol is valid, and no chord follows itself (it would be one long
//   chord to the ear, and the question would have a chord fewer than it says);
// - a wrong loop option is never a rotation of the answer or of another option
//   (vi–IV–I–V IS I–V–vi–IV, heard from a different chord);
// - a new question differs from the previous one (another key, other chords).
//
// The audio is a Learn plan: the key's cadence, a silent bar, then the question,
// played once by the full band (learnPlan's defaults). Quality questions have no
// key, so no cadence: one bar of the chord.
//
// Pure: no tone, no stores.

import type { KeyInfo } from '$lib/model/key';
import { numeralOf } from '$lib/model/numerals';
import { buildPresetChord, PRESET_ROOTS } from '$lib/model/presets';
import { barBeats } from '$lib/model/time';
import { DEFAULT_TIME_SIGNATURE } from '$lib/model/factory';
import { Note } from 'tonal';
import { cadenceSections, learnPlan } from './plan';
import { KEY_ROOTS } from './keys';
import { buildLoop, isRotation, loopById, LOOPS, type Loop } from './loops';
import { QUALITIES, type QualityId, type QuizItem } from './items';
import type { LearnRun, LearnSection, PlanChord } from './types';

interface QuestionBase {
	itemId: string;
	/** Concert symbols the question plays (not the cadence). */
	chords: string[];
}

export interface FunctionQuestion extends QuestionBase {
	kind: 'function';
	key: KeyInfo;
	/** The numeral of each chord, in order. */
	answer: string[];
	/** The answer pad: the item's numerals in this key (the same in every key). */
	options: string[];
}

export interface LoopQuestion extends QuestionBase {
	kind: 'loop';
	key: KeyInfo;
	/** A loop id. */
	answer: string;
	/** Four loop ids, the answer among them, in a random order. */
	options: string[];
}

export interface QualityQuestion extends QuestionBase {
	kind: 'quality';
	key: null;
	answer: QualityId;
	/** The item's qualities, in the item's order: a pad, not a shuffle. */
	options: QualityId[];
}

export type Question = FunctionQuestion | LoopQuestion | QualityQuestion;

/** Chords in a question are half a bar each; the last one rings to its barline. */
const CHORD_BEATS = 2;
/** A loop is heard twice, so it sounds like a loop. */
const LOOP_PASSES = 2;
const LOOP_OPTIONS = 4;
/** Re-rolls before accepting a question equal to the previous one (tiny pools). */
const ATTEMPTS = 12;

const pick = <T>(list: readonly T[], rand: () => number): T =>
	list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.min(i, Math.floor(rand() * (i + 1)));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** A random key in this mode, never the previous question's tonic. */
function pickKey(mode: KeyInfo['mode'], rand: () => number, previous: Question | null | undefined): KeyInfo {
	const avoid = previous?.key ? Note.chroma(previous.key.tonic) : null;
	const roots = KEY_ROOTS[mode].filter((r) => Note.chroma(r) !== avoid);
	return { tonic: pick(roots, rand), mode };
}

const same = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((x, i) => x === b[i]);

function functionQuestion(item: QuizItem, rand: () => number, previous?: Question | null): FunctionQuestion {
	if (item.spec.kind !== 'function') throw new Error('not a function item');
	const spec = item.spec;
	const key = pickKey(spec.mode, rand, previous);
	const vocabulary = spec.chords.map((ch) => buildPresetChord(key.tonic, ch));
	const options = vocabulary.map((symbol) => numeralOf(symbol, key));

	let chords: string[] = [];
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		chords = [];
		for (let i = 0; i < spec.length; i++) {
			const choices = vocabulary.filter((s) => s !== chords[i - 1]);
			chords.push(pick(choices, rand));
		}
		const answer = chords.map((s) => numeralOf(s, key));
		if (previous?.kind !== 'function' || !same(answer, previous.answer)) break;
	}
	return {
		kind: 'function',
		itemId: item.id,
		key,
		chords,
		answer: chords.map((s) => numeralOf(s, key)),
		options
	};
}

/** Up to `count` loops from `from`, none a rotation of anything already chosen. */
function distinctLoops(chosen: Loop[], from: Loop[], count: number): Loop[] {
	const out: Loop[] = [];
	for (const loop of from) {
		if (out.length >= count) break;
		if ([...chosen, ...out].some((o) => isRotation(o.chords, loop.chords))) continue;
		out.push(loop);
	}
	return out;
}

function loopQuestion(item: QuizItem, rand: () => number, previous?: Question | null): LoopQuestion {
	if (item.spec.kind !== 'loop') throw new Error('not a loop item');
	const pool = item.spec.loops.map(loopById).filter((l): l is Loop => l !== null);
	const fresh = pool.filter((l) => !(previous?.kind === 'loop' && previous.answer === l.id));
	const answer = pick(fresh.length > 0 ? fresh : pool, rand);
	const key = pickKey(answer.mode, rand, previous);

	// Wrong options from the item's own pool first, then the whole catalogue —
	// never a rotation of the answer or of each other. Loops in the answer's mode
	// come first: the key is printed, so a minor loop offered over a major key
	// would be ruled out without listening.
	const byMode = (list: Loop[]) => [
		...shuffle(
			list.filter((l) => l.mode === answer.mode),
			rand
		),
		...shuffle(
			list.filter((l) => l.mode !== answer.mode),
			rand
		)
	];
	const others = byMode(pool.filter((l) => l !== answer));
	let wrong = distinctLoops([answer], others, LOOP_OPTIONS - 1);
	if (wrong.length < LOOP_OPTIONS - 1) {
		const rest = byMode(LOOPS.filter((l) => !pool.includes(l)));
		wrong = [...wrong, ...distinctLoops([answer, ...wrong], rest, LOOP_OPTIONS - 1 - wrong.length)];
	}

	return {
		kind: 'loop',
		itemId: item.id,
		key,
		chords: buildLoop(answer, key.tonic),
		answer: answer.id,
		options: shuffle([answer, ...wrong], rand).map((l) => l.id)
	};
}

function qualityQuestion(item: QuizItem, rand: () => number, previous?: Question | null): QualityQuestion {
	if (item.spec.kind !== 'quality') throw new Error('not a quality item');
	const qualities = item.spec.qualities;
	let answer: QualityId = qualities[0];
	let symbol = '';
	// The same quality may come twice in a row (or two options would be a
	// giveaway); the same chord may not.
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		answer = pick(qualities, rand);
		const root = pick(PRESET_ROOTS, rand);
		symbol = buildPresetChord(root, { semitones: 0, quality: QUALITIES[answer].suffix });
		if (previous?.chords[0] !== symbol) break;
	}
	return { kind: 'quality', itemId: item.id, key: null, chords: [symbol], answer, options: [...qualities] };
}

/** A fresh question for an item. `previous` keeps the next one different. */
export function makeQuestion(item: QuizItem, rand: () => number = Math.random, previous?: Question | null): Question {
	switch (item.spec.kind) {
		case 'function':
			return functionQuestion(item, rand, previous);
		case 'loop':
			return loopQuestion(item, rand, previous);
		case 'quality':
			return qualityQuestion(item, rand, previous);
	}
}

/** Half a bar per chord, the last stretched to its barline (no trailing rest). */
export function timedChords(symbols: string[], ts = DEFAULT_TIME_SIGNATURE): PlanChord[] {
	const bar = barBeats(ts);
	const each = Math.min(CHORD_BEATS, bar);
	const out = symbols.map((symbol) => ({ symbol, beats: each }));
	if (out.length > 0) {
		const startsAt = (each * (out.length - 1)) % bar;
		out[out.length - 1].beats = bar - startsAt;
	}
	return out;
}

/** The question's own section: what is asked, without the cadence. */
export function questionSection(q: Question): LearnSection {
	if (q.kind === 'quality') {
		return { role: 'question', chords: [{ symbol: q.chords[0], beats: barBeats(DEFAULT_TIME_SIGNATURE) }] };
	}
	return {
		role: 'question',
		chords: timedChords(q.chords),
		passes: q.kind === 'loop' ? LOOP_PASSES : 1
	};
}

/**
 * The question as a Learn run: the key's cadence and a silent bar, then the
 * question (`cadence: false` skips straight to the question, for a replay).
 * Played once, full band.
 */
export function questionRun(q: Question, opts: { cadence?: boolean } = {}): LearnRun {
	const cadence = (opts.cadence ?? true) && q.key ? cadenceSections(q.key) : [];
	return learnPlan([...cadence, questionSection(q)]);
}
