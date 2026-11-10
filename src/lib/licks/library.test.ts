import { describe, it, expect } from 'vitest';
import { Chord, Note } from 'tonal';
import { isValidChordSymbol } from '$lib/audio/chord';
import { TRANSPOSE_OPTIONS } from '$lib/audio/transpose';
import { packBars } from '$lib/learn/plan';
import { MAX_SLOTS_PER_BAR } from '$lib/model/factory';
import { numeralToChord, parseNumeral } from '$lib/model/numerals';
import { SCALE_ROOTS } from '$lib/model/scales';
import { voicedToVexKey } from '$lib/notation/vex';
import { rangeFor } from '$lib/practice/range';
import type { DrillRunOptions } from '$lib/practice/types';
import { BUILT_IN_LICKS, LICK_STYLES, lickById, licksOfStyle } from './library';
import { lickBeats, resolveLick } from './resolve';
import { isRestToken, isValidToken, tokenToNote } from './tokens';

// Built-in ids are PERSISTED: never rename one, add a new id instead.
const SHIPPED = [
	'lick-blues-thirds',
	'lick-blues-minor',
	'lick-rock-mixolydian',
	'lick-rock-minor-pent',
	'lick-jazz-251-major',
	'lick-jazz-251-minor',
	'lick-jazz-maj7-ninth',
	'lick-jazz-flat-nine'
];

/** Every built-in must fit these in every key at every transposition. */
const RANGES = ['trumpet', 'alto', 'tenor', 'horn', 'flute', 'keys'];
const MAX_SPAN = 18;

const runOpts = (over: Partial<DrillRunOptions> = {}): DrillRunOptions => ({
	root: 'C',
	keyMode: 'off',
	reps: 1,
	offset: 0,
	range: rangeFor('keys'),
	register: 'middle',
	tempo: 120,
	tempoStep: 0,
	tempoMax: 200,
	restBars: 0,
	...over
});

const sounding = (notes: string[]) => notes.filter((t) => !isRestToken(t));
const midiOf = (token: string, tonic = 'C') => Note.midi(tokenToNote(token, tonic)!)!;
const chromas = (symbol: string) => new Set(Chord.get(symbol).notes.map((n) => Note.chroma(n)));

describe('the built-in lick library', () => {
	it('ships exactly the pinned ids, each once', () => {
		expect(BUILT_IN_LICKS.map((l) => l.id)).toEqual(SHIPPED);
		for (const id of SHIPPED) expect(lickById(id)?.id).toBe(id);
		expect(lickById('nope')).toBeUndefined();
	});

	it('files every lick under a known style, and every style has licks', () => {
		for (const l of BUILT_IN_LICKS) expect(LICK_STYLES).toContain(l.style);
		for (const s of LICK_STYLES) expect(licksOfStyle(s).length).toBeGreaterThan(0);
		expect(LICK_STYLES.flatMap(licksOfStyle)).toHaveLength(BUILT_IN_LICKS.length);
	});

	it('is built in, schema 1, 4/4, with a plain name and a sentence', () => {
		for (const l of BUILT_IN_LICKS) {
			expect(l.builtIn).toBe(true);
			expect(l.schemaVersion).toBe(1);
			expect(l.timeSignature).toEqual({ numerator: 4, denominator: 4 });
			expect(l.name.trim()).toBe(l.name);
			// Names carry no numerals (they're set in the display face).
			expect(l.name).not.toMatch(/\b[ivIV]+\b|\d/);
			expect(l.description).toMatch(/^[A-Z].*\.$/);
		}
	});

	it('writes only valid tokens, sounding at least a few notes', () => {
		for (const l of BUILT_IN_LICKS) {
			for (const t of l.notes) expect(isValidToken(t), `${l.id}: ${t}`).toBe(true);
			expect(sounding(l.notes).length).toBeGreaterThanOrEqual(6);
		}
	});

	it('gives every note one rhythm value of at least an eighth, filling the changes exactly', () => {
		for (const l of BUILT_IN_LICKS) {
			expect(l.rhythm).toHaveLength(l.notes.length);
			for (const r of l.rhythm) expect(r).toBeGreaterThanOrEqual(0.5);
			const total = l.rhythm.reduce((a, b) => a + b, 0);
			expect(total, l.id).toBe(lickBeats(l));
			// Whole bars, so the next key starts on a barline with no padding.
			expect(total % 4).toBe(0);
		}
	});

	it('keeps every line within 18 semitones', () => {
		for (const l of BUILT_IN_LICKS) {
			const m = sounding(l.notes).map((t) => midiOf(t));
			expect(Math.max(...m) - Math.min(...m), l.id).toBeLessThanOrEqual(MAX_SPAN);
		}
	});

	it('reads every numeral and builds a valid chord from it in all 12 keys', () => {
		for (const l of BUILT_IN_LICKS) {
			for (const c of l.changes) {
				expect(parseNumeral(c.numeral), `${l.id}: ${c.numeral}`).not.toBeNull();
				for (const tonic of SCALE_ROOTS) {
					const symbol = numeralToChord(c.numeral, { tonic, mode: l.mode });
					expect(symbol && isValidChordSymbol(symbol), `${l.id}: ${c.numeral} in ${tonic}`).toBe(true);
				}
			}
		}
	});

	it('ends on a chord tone of the last chord, in all 12 keys', () => {
		for (const l of BUILT_IN_LICKS) {
			const last = sounding(l.notes).at(-1)!;
			const final = l.changes.at(-1)!.numeral;
			for (const tonic of SCALE_ROOTS) {
				const symbol = numeralToChord(final, { tonic, mode: l.mode })!;
				expect(chromas(symbol).has(Note.chroma(tokenToNote(last, tonic)!)), `${l.id} in ${tonic}`).toBe(true);
			}
		}
	});

	it('resolves in every key, at every transposition, on every horn and keys', () => {
		for (const l of BUILT_IN_LICKS) {
			for (const root of SCALE_ROOTS) {
				for (const { offset } of TRANSPOSE_OPTIONS) {
					for (const id of RANGES) {
						const range = rangeFor(id);
						const run = resolveLick(l, runOpts({ root, offset, range }));
						const label = `${l.id} in ${root}, offset ${offset}, ${id}`;
						expect(run.skipped, label).toEqual([]);
						const notes = run.notes.filter((n) => n.midi !== null);
						expect(notes, label).toHaveLength(sounding(l.notes).length);
						for (const n of notes) {
							expect(n.midi!).toBeGreaterThanOrEqual(range.min);
							expect(n.midi!).toBeLessThanOrEqual(range.max);
						}
					}
				}
			}
		}
	});

	it('spells every note so the staff draws it at the pitch it plays', () => {
		for (const l of BUILT_IN_LICKS) {
			for (const root of SCALE_ROOTS) {
				for (const { offset } of TRANSPOSE_OPTIONS) {
					const run = resolveLick(l, runOpts({ root, offset, range: rangeFor('trumpet') }));
					for (const n of run.notes) {
						if (n.midi === null || n.name === null) continue;
						expect(voicedToVexKey({ midi: n.midi, name: n.name }).key.split('/')[0]).toBe(n.name.toLowerCase());
					}
				}
			}
		}
	});

	it('packs its changes into bars the band can play', () => {
		for (const l of BUILT_IN_LICKS) {
			for (const root of SCALE_ROOTS) {
				const run = resolveLick(l, runOpts({ root, keyMode: 'fourths', reps: 2, restBars: 1 }));
				const bars = packBars(run.chords, l.timeSignature);
				expect(bars.length).toBeGreaterThan(0);
				for (const bar of bars) {
					expect(bar.length).toBeLessThanOrEqual(MAX_SLOTS_PER_BAR);
					expect(bar.reduce((a, s) => a + s.beats, 0)).toBeCloseTo(4, 9);
				}
			}
		}
	});
});
