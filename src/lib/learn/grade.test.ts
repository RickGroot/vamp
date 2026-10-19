import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import type { KeyInfo } from '$lib/model/key';
import { numeralOf } from '$lib/model/numerals';
import { gradeAnswer, gradeNotes, readNotes, sameNumeral } from './grade';
import { QUALITIES, QUIZ_ITEMS } from './items';
import { KEY_ROOTS } from './keys';
import { makeQuestion, type FunctionQuestion, type LoopQuestion, type QualityQuestion, type Question } from './quiz';

const fn: FunctionQuestion = {
	kind: 'function',
	itemId: 'fn-three-chords',
	key: { tonic: 'C', mode: 'major' },
	chords: ['F', 'G', 'C'],
	answer: ['IV', 'V', 'I'],
	options: ['I', 'IV', 'V']
};

describe('sameNumeral', () => {
	it('matches the same chord, and only the same chord', () => {
		expect(sameNumeral('V7', 'V7')).toBe(true);
		expect(sameNumeral('bVII', 'bVII')).toBe(true);
		expect(sameNumeral('V', 'V7')).toBe(false);
		expect(sameNumeral('ii', 'II')).toBe(false); // case is the quality
		expect(sameNumeral('bVII', 'VII')).toBe(false);
		expect(sameNumeral('#IV', 'bV')).toBe(true); // same chord, other spelling
		expect(sameNumeral('', '')).toBe(true);
		expect(sameNumeral('nonsense', 'V')).toBe(false);
	});
});

describe('gradeAnswer', () => {
	it('marks each position of a function answer', () => {
		expect(gradeAnswer(fn, ['IV', 'V', 'I'])).toEqual({ correct: true, marks: [true, true, true] });
		expect(gradeAnswer(fn, ['IV', 'I', 'V'])).toEqual({ correct: false, marks: [true, false, false] });
	});

	it('never passes a short or long answer', () => {
		expect(gradeAnswer(fn, ['IV', 'V'])).toEqual({ correct: false, marks: [true, true, false] });
		expect(gradeAnswer(fn, ['IV', 'V', 'I', 'I']).correct).toBe(false);
		expect(gradeAnswer(fn, []).correct).toBe(false);
	});

	it('marks a single choice', () => {
		const loop: LoopQuestion = {
			kind: 'loop',
			itemId: 'loop-pop',
			key: { tonic: 'C', mode: 'major' },
			chords: ['C', 'G', 'Am', 'F'],
			answer: 'axis',
			options: ['axis', 'doowop', 'hopscotch', 'royal-road']
		};
		expect(gradeAnswer(loop, ['axis'])).toEqual({ correct: true, marks: [true] });
		expect(gradeAnswer(loop, ['doowop'])).toEqual({ correct: false, marks: [false] });
		const quality: QualityQuestion = {
			kind: 'quality',
			itemId: 'quality-triads',
			key: null,
			chords: ['Caug'],
			answer: 'aug',
			options: ['major', 'minor', 'dim', 'aug']
		};
		expect(gradeAnswer(quality, ['aug']).correct).toBe(true);
		expect(gradeAnswer(quality, ['aug', 'aug']).correct).toBe(false);
	});
});

// ---- answers played on a keyboard ----

/** Seeded LCG, so a "random" question is reproducible (the repo convention). */
function lcg(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

/**
 * A chord as a keyboard player might hold it: its notes stacked upwards from
 * `base`, starting on chord tone `inversion` (0 = root position), optionally
 * with the bass doubled an octave down and the top note doubled an octave up.
 */
function voice(symbol: string, inversion = 0, { doubled = false, base = 52 } = {}): number[] {
	const pcs = Chord.get(symbol).notes.map((n) => Note.chroma(n)!);
	const order = [...pcs.slice(inversion), ...pcs.slice(0, inversion)];
	const out: number[] = [];
	let last = base - 1;
	for (const pc of order) {
		let m = last + 1;
		while (m % 12 !== pc) m++;
		out.push(m);
		last = m;
	}
	return doubled ? [out[0] - 12, ...out, out[out.length - 1] + 12] : out;
}

const inversions = (symbol: string) => Chord.get(symbol).notes.map((_, i) => i);

const C: KeyInfo = { tonic: 'C', mode: 'major' };
const threeChords: FunctionQuestion = { ...fn, answer: ['V', 'I', 'IV'], chords: ['G', 'C', 'F'] };
const sevenths: FunctionQuestion = {
	kind: 'function',
	itemId: 'fn-sevenths',
	key: C,
	chords: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
	answer: ['ii7', 'V7', 'Imaj7', 'vi7'],
	options: ['Imaj7', 'ii7', 'V7', 'vi7']
};
const triads: QualityQuestion = {
	kind: 'quality',
	itemId: 'quality-triads',
	key: null,
	chords: ['C'],
	answer: 'major',
	options: ['major', 'minor', 'dim', 'aug']
};
const seventhQualities: QualityQuestion = {
	kind: 'quality',
	itemId: 'quality-sevenths',
	key: null,
	chords: ['Cmaj7'],
	answer: 'maj7',
	options: ['maj7', '7', 'm7', 'm7b5']
};

describe('gradeNotes', () => {
	it('takes a chord in any inversion, and with octaves doubled', () => {
		// F major for IV in C: F A C, A C F, C F A, then spread over three octaves.
		for (const inv of [0, 1, 2]) {
			for (const doubled of [false, true]) {
				expect(gradeNotes(fn, voice('F', inv, { doubled }), 0), `inv ${inv}`).toEqual({ value: 'IV', correct: true });
			}
		}
		expect(gradeNotes(fn, [41, 48, 53, 57, 60, 65, 69, 72], 0)).toEqual({ value: 'IV', correct: true });
		expect(gradeNotes(triads, voice('Eb', 2, { doubled: true }))).toEqual({ value: 'major', correct: true });
	});

	it('marks the chord against the slot being filled', () => {
		expect(gradeNotes(fn, voice('G'), 1)).toEqual({ value: 'V', correct: true });
		expect(gradeNotes(fn, voice('G'), 0)).toEqual({ value: 'V', correct: false });
		expect(gradeNotes(fn, voice('G'), 3).correct).toBe(false); // past the end
	});

	it('a missing third is wrong: it is no chord at all', () => {
		expect(gradeNotes(threeChords, [55, 62, 67], 0)).toEqual({ value: null, correct: false }); // G D G
		expect(gradeNotes(threeChords, [43, 50, 55, 62], 0)).toEqual({ value: null, correct: false });
		expect(gradeNotes(sevenths, [55, 62, 65], 1)).toEqual({ value: null, correct: false }); // G D F: no B
		expect(gradeNotes(triads, [60, 67, 72])).toEqual({ value: null, correct: false });
	});

	it('one note or a fifth is not an answer; nor is a cluster nothing names', () => {
		expect(readNotes(fn, [])).toBeNull();
		expect(readNotes(fn, [60])).toBeNull();
		expect(readNotes(fn, [60, 72, 84])).toBeNull();
		expect(readNotes(fn, [60, 61, 62])).toBeNull();
		expect(readNotes(triads, [60, 65, 67])).toBeNull(); // Csus4 is no quality on the list
	});

	it('an added seventh counts only where the question asks for it', () => {
		// Asked for V (a triad): G7 is a different chord, and wrong.
		expect(gradeNotes(threeChords, voice('G7'), 0)).toEqual({ value: 'V7', correct: false });
		// Asked for V7: right in any inversion; the bare triad is now the wrong one.
		for (const inv of inversions('G7')) expect(gradeNotes(sevenths, voice('G7', inv), 1)).toEqual({ value: 'V7', correct: true });
		expect(gradeNotes(sevenths, voice('G'), 1)).toEqual({ value: 'V', correct: false });
		// The same rule for a chord's quality.
		expect(gradeNotes(triads, voice('Cmaj7'))).toEqual({ value: 'maj7', correct: false });
		expect(gradeNotes(seventhQualities, voice('Cmaj7', 3))).toEqual({ value: 'maj7', correct: true });
		expect(gradeNotes(seventhQualities, voice('C'))).toEqual({ value: 'major', correct: false });
	});

	it('names the chord played by numeralOf in the question\'s key, on the pad or off it', () => {
		const inEb: FunctionQuestion = { ...fn, key: { tonic: 'Eb', mode: 'major' } };
		expect(readNotes(inEb, voice('Ab', 1))).toBe('IV');
		expect(readNotes(inEb, voice('Bb7'))).toBe('V7');
		expect(readNotes(inEb, voice('Cm'))).toBe('vi');
		expect(readNotes(inEb, voice('Db'))).toBe('bVII');
		const inA: FunctionQuestion = { ...fn, key: { tonic: 'A', mode: 'minor' }, options: ['i', 'iv', 'V', 'bVI', 'bVII'] };
		expect(readNotes(inA, voice('E7', 2))).toBe('V7');
		expect(readNotes(inA, voice('F'))).toBe('bVI');
		expect(readNotes(inA, voice('Bm7b5', 1))).toBe('iiø7');
		// Off the pad, it still answers (and is marked wrong like any other slip).
		expect(gradeNotes(fn, voice('Dm'), 0)).toEqual({ value: 'ii', correct: false });
		expect(gradeNotes(fn, voice('Ab'), 0)).toEqual({ value: 'bVI', correct: false });
	});

	it('reads every chord a numeral can name, root in the bass, in all 12 keys and both modes', () => {
		const SUFFIXES = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'mMaj7', 'm7b5', 'dim7', '7#5', 'maj7#5'];
		const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
		for (const mode of ['major', 'minor'] as const) {
			for (const tonic of KEY_ROOTS[mode]) {
				const key = { tonic, mode };
				const q: FunctionQuestion = { ...fn, key, options: [] };
				for (const root of ROOTS) {
					for (const suffix of SUFFIXES) {
						const symbol = `${root}${suffix}`;
						const want = numeralOf(symbol, key);
						expect(want, symbol).not.toBe('');
						expect(readNotes(q, voice(symbol)), `${symbol} in ${tonic} ${mode}`).toBe(want);
						// Inversions too, except the symmetric chords (°7 and +), which are
						// the same notes on another root: their bass names them.
						if (suffix === 'dim7' || suffix === 'aug') continue;
						for (const inv of inversions(symbol)) {
							expect(readNotes(q, voice(symbol, inv, { doubled: true })), `${symbol} /${inv} in ${tonic}`).toBe(want);
						}
					}
				}
			}
		}
	});

	it('a symmetric chord takes the pad\'s name in any inversion', () => {
		const minor: FunctionQuestion = { ...fn, key: { tonic: 'C', mode: 'minor' }, options: ['i', 'iv', 'V7', 'vii°7'] };
		for (const inv of inversions('Bdim7')) expect(readNotes(minor, voice('Bdim7', inv))).toBe('vii°7');
		// Off the pad, the bass names it: D F Ab B is ii°7 in C minor.
		expect(readNotes({ ...minor, options: [] }, voice('Bdim7', 1))).toBe('ii°7');
		for (const inv of [0, 1, 2]) expect(readNotes(triads, voice('Eaug', inv))).toBe('aug');
	});

	it('a loop is four chords: no single chord answers it', () => {
		const loop: LoopQuestion = {
			kind: 'loop',
			itemId: 'loop-pop',
			key: C,
			chords: ['C', 'G', 'Am', 'F'],
			answer: 'axis',
			options: ['axis', 'doowop', 'hopscotch', 'royal-road']
		};
		expect(gradeNotes(loop, voice('C'))).toEqual({ value: null, correct: false });
	});

	it('every quiz question, every chord played in every inversion, is right where it is asked', () => {
		const SEEDS = 40;
		for (const item of QUIZ_ITEMS) {
			if (item.spec.kind === 'loop') continue;
			const rand = lcg(item.id.length * 131);
			let previous: Question | null = null;
			for (let n = 0; n < SEEDS; n++) {
				const q = makeQuestion(item, rand, previous);
				previous = q;
				q.chords.forEach((symbol, at) => {
					for (const inv of inversions(symbol)) {
						for (const doubled of [false, true]) {
							const got = gradeNotes(q, voice(symbol, inv, { doubled }), at);
							expect(got.correct, `${item.id}: ${symbol} /${inv} at ${at}`).toBe(true);
						}
					}
				});
				// And the full answer, played chord by chord, grades as a tapped one does.
				const given = q.chords.map((symbol, at) => gradeNotes(q, voice(symbol, 1), at).value!);
				expect(gradeAnswer(q, given).correct, item.id).toBe(true);
			}
		}
		// Every quality on the pad is reachable by playing it.
		for (const id of Object.keys(QUALITIES) as (keyof typeof QUALITIES)[]) {
			const q: QualityQuestion = { ...seventhQualities, answer: id, options: [id] };
			expect(readNotes(q, voice(`D${QUALITIES[id].suffix}`)), id).toBe(id);
		}
	});
});
