import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { numeralOf } from '$lib/model/numerals';
import { KEY_ROOTS } from './keys';
import { isRotation, loopById } from './loops';
import { QUALITIES, QUIZ_ITEMS, quizItemById } from './items';
import { makeQuestion, questionRun, questionSection, timedChords, type Question } from './quiz';

/** Seeded LCG, so a "random" question is reproducible (the repo convention). */
function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const item = (id: string) => quizItemById(id)!;

/** Every item, many seeds, each question made after the one before. */
function sweep(fn: (q: Question, previous: Question | null) => void) {
	for (const it of QUIZ_ITEMS) {
		const rand = lcg(it.id.length * 101);
		let previous: Question | null = null;
		for (let i = 0; i < SEEDS.length; i++) {
			const q = makeQuestion(it, rand, previous);
			fn(q, previous);
			previous = q;
		}
	}
}

describe('makeQuestion', () => {
	it('is deterministic per seed', () => {
		for (const it of QUIZ_ITEMS) {
			for (const seed of SEEDS.slice(0, 10)) {
				expect(makeQuestion(it, lcg(seed)), it.id).toEqual(makeQuestion(it, lcg(seed)));
			}
		}
	});

	it('plays only valid symbols, and never a chord right after itself', () => {
		sweep((q) => {
			for (const s of q.chords) expect(isValidChordSymbol(s), `${q.itemId}: ${s}`).toBe(true);
			q.chords.forEach((s, i) => {
				if (i > 0) expect(s, `${q.itemId}: ${q.chords.join(' ')}`).not.toBe(q.chords[i - 1]);
			});
		});
	});

	it('computes function answers from the chords, inside the pad', () => {
		sweep((q) => {
			if (q.kind !== 'function') return;
			const spec = item(q.itemId).spec;
			if (spec.kind !== 'function') throw new Error('kind');
			expect(q.chords).toHaveLength(spec.length);
			expect(q.key.mode).toBe(spec.mode);
			expect(KEY_ROOTS[spec.mode]).toContain(q.key.tonic);
			expect(q.answer).toEqual(q.chords.map((s) => numeralOf(s, q.key)));
			for (const n of q.answer) expect(q.options, `${q.itemId}: ${n}`).toContain(n);
			expect(q.options).toHaveLength(spec.chords.length);
		});
	});

	it('offers four loops: the answer and three that are not rotations of it or of each other', () => {
		sweep((q) => {
			if (q.kind !== 'loop') return;
			expect(q.options).toHaveLength(4);
			expect(q.options).toContain(q.answer);
			expect(new Set(q.options).size).toBe(4);
			const loops = q.options.map((id) => loopById(id)!);
			for (let a = 0; a < loops.length; a++) {
				for (let b = a + 1; b < loops.length; b++) {
					expect(isRotation(loops[a].chords, loops[b].chords), `${loops[a].id} / ${loops[b].id}`).toBe(false);
				}
			}
			const answer = loopById(q.answer)!;
			expect(q.key.mode).toBe(answer.mode);
			// The chords are the loop, built in the question's key.
			q.chords.forEach((s, i) => {
				const root = Note.chroma(Chord.get(s).tonic!)!;
				expect((root - Note.chroma(q.key.tonic)! + 12) % 12).toBe(answer.chords[i].semitones % 12);
			});
		});
	});

	it('prefers wrong options in the answer’s mode, so the printed key gives nothing away', () => {
		sweep((q) => {
			if (q.kind !== 'loop') return;
			const spec = item(q.itemId).spec;
			if (spec.kind !== 'loop') throw new Error('kind');
			const answer = loopById(q.answer)!;
			const wrong = q.options.filter((id) => id !== q.answer).map((id) => loopById(id)!);
			const sameMode = wrong.filter((l) => l.mode === answer.mode).length;
			// As many same-mode options as the pool can give without rotations.
			const classes: string[][] = [];
			for (const id of spec.loops) {
				const l = loopById(id)!;
				if (l.mode !== answer.mode || isRotation(l.chords, answer.chords)) continue;
				if (classes.some((c) => isRotation(loopById(c[0])!.chords, l.chords))) continue;
				classes.push([id]);
			}
			expect(sameMode, `${q.itemId}: ${q.answer} → ${q.options.join(', ')}`).toBe(Math.min(3, classes.length));
		});
	});

	it('never offers the Axis as a wrong answer to the minor epic loop', () => {
		const rock = item('loop-rock');
		for (const seed of SEEDS) {
			const q = makeQuestion(rock, lcg(seed));
			if (q.kind !== 'loop' || q.answer !== 'epic') continue;
			expect(q.options).not.toContain('axis');
		}
	});

	it('asks a quality with one chord and the item’s whole pad, in order', () => {
		sweep((q) => {
			if (q.kind !== 'quality') return;
			const spec = item(q.itemId).spec;
			if (spec.kind !== 'quality') throw new Error('kind');
			expect(q.key).toBeNull();
			expect(q.chords).toHaveLength(1);
			expect(q.options).toEqual(spec.qualities);
			expect(q.chords[0].endsWith(QUALITIES[q.answer].suffix)).toBe(true);
			const parsed = Chord.get(q.chords[0]);
			expect(parsed.empty).toBe(false);
		});
	});

	it('never repeats the previous question', () => {
		sweep((q, previous) => {
			if (!previous) return;
			expect(q.chords, q.itemId).not.toEqual(previous.chords);
			if (q.key && previous.key) {
				expect(Note.chroma(q.key.tonic), `${q.itemId} key`).not.toBe(Note.chroma(previous.key.tonic));
			}
			if (q.kind === 'loop' && previous.kind === 'loop') expect(q.answer).not.toBe(previous.answer);
		});
	});

	it('uses every chord and every loop of an item, given enough questions', () => {
		for (const it of QUIZ_ITEMS) {
			const rand = lcg(42);
			const seen = new Set<string>();
			let previous: Question | null = null;
			for (let i = 0; i < 200; i++) {
				const q = makeQuestion(it, rand, previous);
				if (q.kind === 'function') q.answer.forEach((n) => seen.add(n));
				else seen.add(q.answer);
				previous = q;
			}
			const want =
				it.spec.kind === 'function' ? it.spec.chords.length : it.spec.kind === 'loop' ? it.spec.loops.length : it.spec.qualities.length;
			expect(seen.size, it.id).toBe(want);
		}
	});
});

describe('timedChords', () => {
	it('gives half a bar each and rings the last chord to its barline', () => {
		expect(timedChords(['C', 'F', 'G']).map((c) => c.beats)).toEqual([2, 2, 4]);
		expect(timedChords(['C', 'F', 'G', 'Am']).map((c) => c.beats)).toEqual([2, 2, 2, 2]);
		expect(timedChords(['C']).map((c) => c.beats)).toEqual([4]);
		expect(timedChords([])).toEqual([]);
	});
});

describe('questionRun', () => {
	const roles = (q: Question, cadence?: boolean) =>
		questionRun(q, { cadence }).sections.map((s) => s.role);

	it('sets the key, waits a bar, then asks — once, with the full band', () => {
		const q = makeQuestion(item('fn-three-chords'), lcg(3));
		const run = questionRun(q);
		expect(run.sections.map((s) => s.role)).toEqual(['prefix', 'gap', 'question']);
		expect(run.plan.source).toBe('learn');
		expect(run.plan.loop).toBe(false);
		expect(run.plan.mix).toBe('full');
		// Learn events use the cue channel, never the editor's slot channel.
		expect(run.plan.events.every((ev) => ev.slotIndex === null)).toBe(true);
		// Every question chord has a cue, in order.
		const asked = run.cues.filter((c) => run.sections[c.section].role === 'question' && c.chord !== null);
		expect(asked.map((c) => q.chords[c.chord!])).toEqual(q.chords);
	});

	it('skips the cadence on request, and always for a quality question', () => {
		const q = makeQuestion(item('fn-four-chords'), lcg(5));
		expect(roles(q, false)).toEqual(['question']);
		const quality = makeQuestion(item('quality-triads'), lcg(5));
		expect(roles(quality)).toEqual(['question']);
		expect(questionSection(quality).chords).toEqual([{ symbol: quality.chords[0], beats: 4 }]);
	});

	it('plays a loop twice', () => {
		const q = makeQuestion(item('loop-pop'), lcg(9));
		expect(questionSection(q).passes).toBe(2);
		const run = questionRun(q);
		const passes = new Set(run.cues.filter((c) => run.sections[c.section].role === 'question').map((c) => c.pass));
		expect([...passes]).toEqual([0, 1]);
	});

	it('plays the cadence in the question’s key', () => {
		const q = makeQuestion(item('fn-minor-key'), lcg(11));
		if (q.kind !== 'function') throw new Error('kind');
		const run = questionRun(q);
		const first = run.plan.events.find((ev) => ev.kind === 'chord' && ev.cueIndex === 0 && ev.midi.length > 0)!;
		// The cadence opens on the tonic chord: its lowest note's pitch class is
		// in the tonic triad.
		const tonic = Note.chroma(q.key.tonic)!;
		const triad = [tonic, (tonic + 3) % 12, (tonic + 7) % 12];
		expect(first.midi.every((m) => triad.includes(m % 12))).toBe(true);
	});
});
