import { describe, it, expect } from 'vitest';
import { isValidChordSymbol } from '$lib/audio/chord';
import { numeralOf, parseNumeral } from '$lib/model/numerals';
import { buildPresetChord, PRESET_ROOTS } from '$lib/model/presets';
import { KEY_ROOTS } from './keys';
import { isRotation, loopById } from './loops';
import { QUALITIES, QUIZ_ITEMS, quizItemById, type QualityId } from './items';

// Progress in `vamp:learn` is keyed by these. Adding an item is fine; renaming or
// removing one silently orphans everyone's progress — so this list only grows.
const SHIPPED_IDS = [
	'fn-three-chords',
	'fn-four-chords',
	'fn-rock-chords',
	'fn-borrowed',
	'fn-whole-key',
	'fn-minor-key',
	'fn-sevenths',
	'fn-minor-sevenths',
	'loop-pop',
	'loop-rock',
	'loop-jazz',
	'quality-major-minor',
	'quality-triads',
	'quality-sevenths'
];

describe('quiz item ids', () => {
	it('keeps every shipped id', () => {
		const ids = QUIZ_ITEMS.map((i) => i.id);
		for (const id of SHIPPED_IDS) expect(ids, id).toContain(id);
	});

	it('are unique and storage-safe', () => {
		const ids = QUIZ_ITEMS.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
		expect(quizItemById('fn-three-chords')?.title).toBe('Three chords');
		expect(quizItemById('nope')).toBeNull();
	});

	it('titles are names without numerals (a select can draw no ♭)', () => {
		for (const item of QUIZ_ITEMS) {
			expect(item.title.trim().length, item.id).toBeGreaterThan(0);
			expect(item.title, item.id).not.toMatch(/\b[ivIV]+\b|[♭♯]/);
		}
	});
});

describe('function items', () => {
	const fn = QUIZ_ITEMS.flatMap((i) => (i.spec.kind === 'function' ? [{ id: i.id, spec: i.spec }] : []));

	it('build valid chords with distinct, parseable numerals — the same in all 12 keys', () => {
		for (const { id, spec } of fn) {
			const pad = (tonic: string) =>
				spec.chords.map((ch) => {
					const symbol = buildPresetChord(tonic, ch);
					expect(isValidChordSymbol(symbol), `${id} in ${tonic}: ${symbol}`).toBe(true);
					return numeralOf(symbol, { tonic, mode: spec.mode });
				});
			const reference = pad(KEY_ROOTS[spec.mode][0]);
			expect(new Set(reference).size, id).toBe(reference.length);
			for (const n of reference) expect(parseNumeral(n), `${id}: ${n}`).not.toBeNull();
			for (const tonic of KEY_ROOTS[spec.mode]) expect(pad(tonic), `${id} in ${tonic}`).toEqual(reference);
		}
	});

	it('ask for at least two chords and offer at least two', () => {
		for (const { id, spec } of fn) {
			expect(spec.length, id).toBeGreaterThanOrEqual(2);
			expect(spec.chords.length, id).toBeGreaterThanOrEqual(2);
		}
	});

	it('the first item is the three chords, I IV V', () => {
		const spec = quizItemById('fn-three-chords')!.spec;
		if (spec.kind !== 'function') throw new Error('kind');
		expect(spec.chords.map((ch) => numeralOf(buildPresetChord('C', ch), { tonic: 'C', mode: 'major' }))).toEqual([
			'I',
			'IV',
			'V'
		]);
	});
});

describe('loop items', () => {
	it('name known loops and hold at least four that are not rotations of each other', () => {
		for (const item of QUIZ_ITEMS) {
			if (item.spec.kind !== 'loop') continue;
			const loops = item.spec.loops.map((id) => {
				const loop = loopById(id);
				expect(loop, `${item.id}: ${id}`).not.toBeNull();
				return loop!;
			});
			// Rotation classes: a question shows four options, pairwise distinct sounds.
			const classes: typeof loops = [];
			for (const l of loops) if (!classes.some((c) => isRotation(c.chords, l.chords))) classes.push(l);
			expect(classes.length, item.id).toBeGreaterThanOrEqual(4);
		}
	});
});

describe('quality items', () => {
	it('build a valid chord of every quality on every root', () => {
		for (const q of Object.keys(QUALITIES) as QualityId[]) {
			for (const root of PRESET_ROOTS) {
				const symbol = buildPresetChord(root, { semitones: 0, quality: QUALITIES[q].suffix });
				expect(symbol, `${q} on ${root}`).toBe(`${root}${QUALITIES[q].suffix}`);
				expect(isValidChordSymbol(symbol)).toBe(true);
			}
		}
	});

	it('offer at least two known qualities', () => {
		for (const item of QUIZ_ITEMS) {
			if (item.spec.kind !== 'quality') continue;
			expect(item.spec.qualities.length, item.id).toBeGreaterThanOrEqual(2);
			for (const q of item.spec.qualities) expect(QUALITIES[q], `${item.id}: ${q}`).toBeDefined();
		}
	});
});
