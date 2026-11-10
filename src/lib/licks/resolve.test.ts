import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { lickBeats, paddedBeats, resolveLick } from './resolve';
import { tokenToNote } from './tokens';
import type { LickDefinition } from './types';
import { rangeFor } from '$lib/practice/range';
import { concertMidi } from '$lib/practice/resolve';
import type { DrillRunOptions } from '$lib/practice/types';
import { packBars } from '$lib/learn/plan';
import { isValidChordSymbol } from '$lib/audio/chord';
import { voicedToVexKey } from '$lib/notation/vex';
import { TRANSPOSE_OPTIONS } from '$lib/audio/transpose';
import { SCALE_ROOTS } from '$lib/model/scales';
import { Interval } from 'tonal';

const KEYS = rangeFor('keys');
const FOUR = { numerator: 4, denominator: 4 };

const run = (over: Partial<DrillRunOptions> = {}): DrillRunOptions => ({
	root: 'C',
	keyMode: 'off',
	reps: 1,
	offset: 0,
	range: KEYS,
	register: 'middle',
	tempo: 120,
	tempoStep: 0,
	tempoMax: 200,
	restBars: 0,
	...over
});

const lick = (over: Partial<LickDefinition> = {}): LickDefinition => ({
	schemaVersion: 1,
	id: 'test',
	name: 'test',
	description: '',
	createdAt: 0,
	updatedAt: 0,
	mode: 'major',
	changes: [
		{ numeral: 'ii7', beats: 4 },
		{ numeral: 'V7', beats: 4 },
		{ numeral: 'Imaj7', beats: 8 }
	],
	notes: ['2', '4', '6', '8', '_7', '2', '4', '6', '3'],
	rhythm: [1, 1, 1, 1, 1, 1, 1, 1, 8],
	feel: 'straight',
	timeSignature: FOUR,
	style: 'jazz',
	...over
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('resolveLick — the line', () => {
	it('spells the degrees in the key it is played in', () => {
		const got = resolveLick(lick({ notes: ['1', 'b3', '4', 'b5', '5', 'b7'], rhythm: [1] }), run());
		expect(got.notes.slice(0, 6).map((n) => n.name)).toEqual(['C', 'Eb', 'F', 'Gb', 'G', 'Bb']);
		const inE = resolveLick(lick({ notes: ['1', 'b3', '#4'], rhythm: [1] }), run({ root: 'E' }));
		expect(inE.notes.slice(0, 3).map((n) => n.name)).toEqual(['E', 'G', 'A#']);
	});

	it('labels and roles come from the tokens', () => {
		const got = resolveLick(lick({ notes: ['_5', '1', 'b9', '10', 'r'], rhythm: [1] }), run());
		expect(got.notes.slice(0, 5).map((n) => n.label)).toEqual(['5', '1', 'b9', '3', '']);
		expect(got.notes.slice(0, 5).map((n) => n.role)).toEqual(['fifth', 'root', 'scale', 'third', 'rest']);
	});

	it('reads an unknown token as a rest', () => {
		const got = resolveLick(lick({ notes: ['1', 'x', '3'], rhythm: [1] }), run());
		expect(got.notes[1]).toMatchObject({ midi: null, name: '', role: 'rest' });
		expect(got.notes[2].name).toBe('E');
	});

	it('stops where the changes end, clipping the last note', () => {
		const got = resolveLick(
			lick({ notes: Array(20).fill('1'), rhythm: [1.5], changes: [{ numeral: 'I', beats: 8 }] }),
			run()
		);
		// 5 × 1.5 = 7.5, then 0.5 of the sixth; nothing after.
		expect(got.notes.map((n) => n.durQuarters)).toEqual([1.5, 1.5, 1.5, 1.5, 1.5, 0.5]);
		expect(got.totalQuarters).toBe(8);
	});

	it('pads a short line with a rest to the barline', () => {
		const got = resolveLick(lick({ notes: ['1', '3'], rhythm: [1] }), run());
		const last = got.notes[got.notes.length - 1];
		expect(last).toMatchObject({ midi: null, role: 'rest', atQuarters: 2, durQuarters: 14 });
		expect(got.totalQuarters).toBe(16);
	});

	it('pads changes that stop mid-bar to the barline, lead and band alike', () => {
		const l = lick({
			changes: [
				{ numeral: 'V7', beats: 4 },
				{ numeral: 'I', beats: 2 }
			],
			notes: ['5', '4', '3', '2', '1', '1'],
			rhythm: [1]
		});
		expect(lickBeats(l)).toBe(6);
		expect(paddedBeats(l)).toBe(8);
		const got = resolveLick(l, run());
		expect(got.totalQuarters).toBe(8);
		expect(got.chords).toEqual([
			{ symbol: 'G7', beats: 4 },
			{ symbol: 'C', beats: 2 },
			{ symbol: '', beats: 2 }
		]);
	});

	it('with no changes, lasts one pass of its notes', () => {
		const l = lick({ changes: [], notes: ['1', '2', '3'], rhythm: [1] });
		expect(lickBeats(l)).toBe(3);
		const got = resolveLick(l, run());
		expect(got.notes.map((n) => n.durQuarters)).toEqual([1, 1, 1, 1]);
		expect(got.chords).toEqual([{ symbol: '', beats: 4 }]);
	});

	it('counts beats in the lick’s own meter', () => {
		const six = { numerator: 6, denominator: 8 };
		const got = resolveLick(
			lick({ timeSignature: six, changes: [{ numeral: 'I', beats: 6 }], notes: ['1', '3', '5'], rhythm: [2] }),
			run({ timeSignature: FOUR })
		);
		// An eighth-note beat: 2 beats = 1 quarter, the bar = 3 quarters.
		expect(got.notes.map((n) => n.durQuarters)).toEqual([1, 1, 1]);
		expect(got.totalQuarters).toBe(3);
		// The song's meter never applies: runMeter reads the lick's.
		expect(got.options.timeSignature).toEqual(six);
	});
});

describe('resolveLick — the changes', () => {
	it('resolves numerals into concert symbols in each key', () => {
		const got = resolveLick(lick(), run({ root: 'C' }));
		expect(got.chords.map((c) => c.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
		const minor = resolveLick(
			lick({
				mode: 'minor',
				changes: [
					{ numeral: 'iiø7', beats: 4 },
					{ numeral: 'V7', beats: 4 },
					{ numeral: 'i', beats: 4 }
				]
			}),
			run({ root: 'A' })
		);
		expect(minor.chords.map((c) => c.symbol)).toEqual(['Bm7b5', 'E7', 'Am']);
	});

	it('splits a chord at the barline so the band never shifts', () => {
		const got = resolveLick(
			lick({
				changes: [
					{ numeral: 'I', beats: 2 },
					{ numeral: 'IV', beats: 4 },
					{ numeral: 'V7', beats: 2 }
				]
			}),
			run()
		);
		expect(got.chords).toEqual([
			{ symbol: 'C', beats: 2 },
			{ symbol: 'F', beats: 2 },
			{ symbol: 'F', beats: 2 },
			{ symbol: 'G7', beats: 2 }
		]);
	});

	it('packs into bars without moving a chord', () => {
		for (const changes of [
			lick().changes,
			[
				{ numeral: 'I', beats: 3 },
				{ numeral: 'vi', beats: 3 },
				{ numeral: 'ii', beats: 3 },
				{ numeral: 'V', beats: 3 },
				{ numeral: 'I', beats: 1 }
			]
		]) {
			const got = resolveLick(lick({ changes }), run({ keyMode: 'fourths', reps: 3, restBars: 1 }));
			const packed = packBars(got.chords, FOUR).flat();
			expect(packed.map(({ symbol, beats }) => ({ symbol, beats }))).toEqual(got.chords);
		}
	});

	it('names each note’s chord in WRITTEN pitch', () => {
		const got = resolveLick(lick(), run({ offset: 2 }));
		expect(got.notes[0]).toMatchObject({ name: 'E', chord: 'Em7' });
		expect(got.notes[4]).toMatchObject({ chord: 'A7' });
		expect(got.notes[got.notes.length - 1]).toMatchObject({ name: 'F#', chord: 'Dmaj7' });
		// The band stays concert.
		expect(got.chords[0].symbol).toBe('Dm7');
	});

	it('builds valid chords in every key, both modes', () => {
		const major = lick({
			changes: ['Imaj7', 'vi7', 'ii7', 'V7', 'bVII7', 'IV7', 'iii7', 'bIIImaj7'].map((numeral) => ({ numeral, beats: 2 }))
		});
		const minor = lick({
			mode: 'minor',
			changes: ['i7', 'iv7', 'bVImaj7', 'V7', 'iiø7', 'bVII7', 'bIIImaj7', 'vii°7'].map((numeral) => ({
				numeral,
				beats: 2
			}))
		});
		for (const l of [major, minor]) {
			for (const root of SCALE_ROOTS) {
				const got = resolveLick(l, run({ root }));
				for (const c of got.chords) expect(isValidChordSymbol(c.symbol), `${root} ${c.symbol}`).toBe(true);
				// The numeral names the chord ON its degree: IV7 in major, bVII7 in minor.
				const degree = Note.transpose(root, l.mode === 'major' ? '4P' : '7m');
				expect(Note.chroma(Chord.get(got.chords[5].symbol).tonic ?? '')).toBe(Note.chroma(degree));
			}
		}
	});
});

describe('resolveLick — keys, range and repetitions', () => {
	it('moves every note by whole octaves only', () => {
		for (const register of ['low', 'middle', 'high'] as const) {
			for (const root of SCALE_ROOTS) {
				const got = resolveLick(lick(), run({ root, register, range: rangeFor('trumpet'), offset: 2 }));
				const written = Note.simplify(Note.transpose(root, Interval.fromSemitones(2)));
				const raw = lick().notes.map((t) => Note.midi(tokenToNote(t, written)!)!);
				const fitted = got.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
				expect(fitted.length).toBe(raw.length);
				fitted.forEach((m, i) => expect(Math.abs((m - raw[i]) % 12)).toBe(0));
			}
		}
	});

	it('keeps name and midi agreeing (voicedToVexKey round trip)', () => {
		for (const offset of TRANSPOSE_OPTIONS.map((o) => o.offset)) {
			for (const root of SCALE_ROOTS) {
				const got = resolveLick(lick({ notes: ['1', 'b3', '#4', '7', 'b9', '#11', '_5', 'b13'], rhythm: [1] }), run({ root, offset }));
				for (const n of got.notes) {
					if (n.midi === null) continue;
					expect(voicedToVexKey({ midi: n.midi, name: n.name }).key.split('/')[0]).toBe(n.name.toLowerCase());
				}
			}
		}
	});

	it('sounds at concert pitch through concertMidi', () => {
		const concert = resolveLick(lick(), run({ offset: 0 }));
		const bb = resolveLick(lick(), run({ offset: 2, register: 'middle' }));
		const a = concert.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
		const b = bb.notes.filter((n) => n.midi !== null).map((n) => concertMidi(n.midi!, 2));
		// Same pitch classes; the written range may pick another octave.
		a.forEach((m, i) => expect((((m - b[i]) % 12) + 12) % 12).toBe(0));
	});

	it('skips a key whose line does not fit the range, and says why', () => {
		const got = resolveLick(lick({ notes: ['_5', '13'], rhythm: [1] }), run({ range: { min: 60, max: 72 } }));
		expect(got.notes).toEqual([]);
		expect(got.chords).toEqual([]);
		expect(got.skipped).toEqual([{ concertRoot: 'C', reason: 'span' }]);
	});

	it('calls a line of rests unresolvable', () => {
		const got = resolveLick(lick({ notes: ['r', 'r'] }), run());
		expect(got.skipped).toEqual([{ concertRoot: 'C', reason: 'unresolvable' }]);
		expect(got.totalQuarters).toBe(0);
	});

	it('starts every repetition on a barline, the band with it', () => {
		const got = resolveLick(
			lick({ changes: [{ numeral: 'V7', beats: 3 }, { numeral: 'I', beats: 2 }] }),
			run({ keyMode: 'fourths', reps: 12, restBars: 1 })
		);
		expect(got.phrases.length).toBe(12);
		expect(new Set(got.phrases.map((p) => p.concertRoot)).size).toBe(12);
		for (const p of got.phrases) expect(p.startQuarters % 4).toBe(0);
		expect(sum(got.chords.map((c) => c.beats))).toBe(got.totalQuarters);
		expect(sum(got.notes.map((n) => n.durQuarters))).toBe(got.totalQuarters);
	});

	it('rests between repetitions, not after the last', () => {
		const got = resolveLick(lick(), run({ keyMode: 'fourths', reps: 2, restBars: 2 }));
		expect(got.phrases.map((p) => [p.startQuarters, p.lengthQuarters])).toEqual([
			[0, 24],
			[24, 16]
		]);
		expect(got.chords.filter((c) => c.symbol === '')).toEqual([{ symbol: '', beats: 8 }]);
		expect(got.notes[got.notes.length - 1].role).not.toBe('rest');
	});

	it('steps the tempo per repetition like a drill', () => {
		const got = resolveLick(lick(), run({ keyMode: 'fourths', reps: 3, tempoStep: 5 }));
		expect(got.phrases.map((p) => p.tempo)).toEqual([120, 125, 130]);
	});
});
