import { describe, it, expect } from 'vitest';
import { RECENT_KEY, RECENT_LIMIT, chordPreview, forgetSketch, readRecent, rememberSketch } from './recent';
import type { DraftStorage } from './draft';
import { createBar, createProgression, createSlot } from '$lib/model/factory';

function fakeStorage(opts: { failGet?: boolean; failSet?: boolean } = {}) {
	const data = new Map<string, string>();
	const storage: DraftStorage = {
		getItem: (k) => {
			if (opts.failGet) throw new DOMException('blocked', 'SecurityError');
			return data.get(k) ?? null;
		},
		setItem: (k, v) => {
			if (opts.failSet) throw new DOMException('full', 'QuotaExceededError');
			data.set(k, v);
		},
		removeItem: (k) => void data.delete(k)
	};
	return { storage, data };
}

const song = (name: string, chords: string[]) =>
	createProgression({ name, bars: chords.map((c) => createBar(undefined, [createSlot(c, 4)])) });

describe('recent sketches', () => {
	it('remembers what left the canvas, newest first', () => {
		const { storage } = fakeStorage();
		rememberSketch(storage, song('One', ['C']), 1);
		rememberSketch(storage, song('Two', ['Dm7', 'G7']), 2);
		const recent = readRecent(storage);
		expect(recent.map((r) => r.song.name)).toEqual(['Two', 'One']);
		expect(recent[0].at).toBe(2);
	});

	it('never keeps a blank song', () => {
		const { storage } = fakeStorage();
		rememberSketch(storage, createProgression());
		expect(readRecent(storage)).toEqual([]);
	});

	it('keeps one entry per song, moving a replaced-again song back to the top', () => {
		const { storage } = fakeStorage();
		const a = song('A', ['C']);
		rememberSketch(storage, a, 1);
		rememberSketch(storage, song('B', ['F']), 2);
		rememberSketch(storage, { ...a, name: 'A, later' }, 3);
		expect(readRecent(storage).map((r) => r.song.name)).toEqual(['A, later', 'B']);
	});

	it(`caps the list at ${RECENT_LIMIT}`, () => {
		const { storage } = fakeStorage();
		for (let i = 0; i < RECENT_LIMIT + 3; i++) rememberSketch(storage, song(`S${i}`, ['C']), i);
		const recent = readRecent(storage);
		expect(recent).toHaveLength(RECENT_LIMIT);
		expect(recent[0].song.name).toBe(`S${RECENT_LIMIT + 2}`);
	});

	it('forgets a dismissed sketch', () => {
		const { storage } = fakeStorage();
		const a = song('A', ['C']);
		rememberSketch(storage, a);
		rememberSketch(storage, song('B', ['F']));
		expect(forgetSketch(storage, a.id).map((r) => r.song.name)).toEqual(['B']);
	});

	it('survives corrupt, hostile and blocked storage', () => {
		const corrupt = fakeStorage();
		corrupt.data.set(RECENT_KEY, '{not json');
		expect(readRecent(corrupt.storage)).toEqual([]);
		expect(corrupt.data.has(RECENT_KEY)).toBe(false);

		const hostile = fakeStorage();
		hostile.data.set(
			RECENT_KEY,
			JSON.stringify([null, 3, { song: [] }, { song: { bars: [{ slots: [{ chord: 'C', beats: -4 }] }] }, at: 'x' }])
		);
		const [only] = readRecent(hostile.storage);
		// Routed through migrateProgression: the impossible duration is made safe.
		expect(only.song.bars[0].slots[0].beats).toBeGreaterThan(0);
		expect(only.at).toBe(0);

		expect(readRecent(fakeStorage({ failGet: true }).storage)).toEqual([]);
		const full = fakeStorage({ failSet: true });
		expect(() => rememberSketch(full.storage, song('A', ['C']))).not.toThrow();
	});

	it('previews the first few changes, collapsing repeats', () => {
		expect(chordPreview(song('x', ['C', 'C', 'Am', 'F', 'G7']))).toBe('C · Am · F · G7');
		expect(chordPreview(song('x', ['C', 'Am', 'F', 'G7', 'E7', 'A7']))).toBe('C · Am · F · G7 …');
	});
});
