import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { detectProgressions, patternInfo } from '$lib/model/analysis';
import { createSlot, newId } from '$lib/model/factory';
import { numeralOf } from '$lib/model/numerals';
import type { Bar } from '$lib/model/types';
import { KEY_ROOTS, spellKey } from './keys';
import { buildLoop, isRotation, loopById, loopNumerals, LOOPS } from './loops';

const loop = (id: string) => loopById(id)!;
/** Each chord its own bar, the loop played twice: how a quiz plays it. */
const twice = (symbols: string[]): Bar[] =>
	[...symbols, ...symbols].map((s) => ({ id: newId(), slots: [createSlot(s, 4)] }));

describe('the loop catalogue', () => {
	it('has unique ids and a pattern analysis.ts knows for every loop', () => {
		expect(new Set(LOOPS.map((l) => l.id)).size).toBe(LOOPS.length);
		for (const l of LOOPS) expect(patternInfo(l.patternId), l.id).not.toBeNull();
	});

	it('builds valid symbols with the right root in every key', () => {
		for (const l of LOOPS) {
			for (const tonic of KEY_ROOTS[l.mode]) {
				const symbols = buildLoop(l, tonic);
				symbols.forEach((symbol, i) => {
					expect(isValidChordSymbol(symbol), `${l.id} in ${tonic}: ${symbol}`).toBe(true);
					const root = Chord.get(symbol).tonic!;
					expect((Note.chroma(root)! - Note.chroma(tonic)! + 12) % 12, `${l.id} ${symbol}`).toBe(
						l.chords[i].semitones % 12
					);
				});
			}
		}
	});

	it('never puts a chord right after itself, even across the loop seam', () => {
		for (const l of LOOPS) {
			const n = l.chords.length;
			l.chords.forEach((ch, i) => {
				const next = l.chords[(i + 1) % n];
				expect(ch.semitones === next.semitones && ch.quality === next.quality, l.id).toBe(false);
			});
		}
	});

	it('computes its numerals, the same in every key', () => {
		expect(loopNumerals(loop('axis'))).toEqual(['I', 'V', 'vi', 'IV']);
		expect(loopNumerals(loop('epic'))).toEqual(['i', 'bVI', 'bIII', 'bVII']);
		expect(loopNumerals(loop('mario'))).toEqual(['bVI', 'bVII', 'I']);
		expect(loopNumerals(loop('jazz-251'))).toEqual(['ii7', 'V7', 'Imaj7']);
		expect(loopNumerals(loop('minor-251'))).toEqual(['iiø7', 'V7', 'i7']);
		for (const l of LOOPS) {
			const want = loopNumerals(l);
			for (const tonic of KEY_ROOTS[l.mode]) {
				const key = { tonic, mode: l.mode };
				expect(buildLoop(l, tonic).map((s) => numeralOf(s, key)), `${l.id} in ${tonic}`).toEqual(want);
			}
		}
	});

	// The name a quiz teaches must be the name Sketch prints over your song.
	it('is detected by analysis.ts in all 12 roots, played twice', () => {
		for (const l of LOOPS) {
			for (const tonic of KEY_ROOTS[l.mode]) {
				const found = detectProgressions(twice(buildLoop(l, tonic)), { tonic, mode: l.mode });
				expect(found.map((d) => d.patternId), `${l.id} in ${tonic}`).toContain(l.patternId);
			}
		}
	});
});

describe('isRotation', () => {
	it('is the same cycle started on another chord', () => {
		expect(isRotation(loop('axis').chords, loop('axis-vi').chords)).toBe(true);
		expect(isRotation(loop('axis').chords, loop('axis-iv').chords)).toBe(true);
		expect(isRotation(loop('axis').chords, loop('axis-v').chords)).toBe(true);
		expect(isRotation(loop('axis-iv').chords, loop('axis-v').chords)).toBe(true);
	});

	it('sees the minor epic loop as the Axis started on vi', () => {
		expect(isRotation(loop('epic').chords, loop('axis').chords)).toBe(true);
		expect(isRotation(loop('epic').chords, loop('axis-vi').chords)).toBe(true);
	});

	it('is symmetric and reflexive', () => {
		for (const a of LOOPS) {
			expect(isRotation(a.chords, a.chords), a.id).toBe(true);
			for (const b of LOOPS) expect(isRotation(a.chords, b.chords)).toBe(isRotation(b.chords, a.chords));
		}
	});

	it('is not a reordering of the same chords', () => {
		// Hopscotch and doo-wop use the Axis chords, in an order no rotation gives.
		expect(isRotation(loop('hopscotch').chords, loop('axis').chords)).toBe(false);
		expect(isRotation(loop('doowop').chords, loop('axis').chords)).toBe(false);
		expect(isRotation(loop('doowop').chords, loop('hopscotch').chords)).toBe(false);
		expect(isRotation(loop('turnaround').chords, loop('doowop').chords)).toBe(false);
		expect(isRotation(loop('doowop-sevenths').chords, loop('doowop').chords)).toBe(true);
		expect(isRotation(loop('mixolydian').chords, loop('mario').chords)).toBe(false);
		expect(isRotation(loop('andalusian').chords, loop('epic').chords)).toBe(false);
	});

	it('compares by triad, so a seventh is the same chord as its triad', () => {
		const triads = [
			{ semitones: 0, quality: '' },
			{ semitones: 9, quality: 'm' },
			{ semitones: 2, quality: 'm' },
			{ semitones: 7, quality: '' }
		];
		expect(isRotation(triads, loop('turnaround').chords)).toBe(true);
		expect(isRotation(triads.slice(0, 3), loop('turnaround').chords)).toBe(false); // lengths differ
		expect(isRotation([], [])).toBe(false);
	});
});

describe('keys', () => {
	it('spells a minor key the way it is written', () => {
		expect(spellKey('Db', 'minor')).toBe('C#');
		expect(spellKey('C#', 'major')).toBe('Db');
		expect(spellKey('Ab', 'minor')).toBe('G#');
		expect(KEY_ROOTS.major).toHaveLength(12);
		expect(new Set(KEY_ROOTS.minor.map((r) => Note.chroma(r))).size).toBe(12);
	});
});
