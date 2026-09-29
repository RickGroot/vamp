import { describe, it, expect } from 'vitest';
import { DRAFT_KEY, isBlank, readDraft, writeDraft, type DraftStorage } from './draft';
import { createBar, createProgression, createSlot } from '$lib/model/factory';

/** An in-memory Storage, optionally rigged to fail the way real browsers do. */
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

const song = () =>
	createProgression({
		name: 'Blue Monday-ish',
		tempo: 132,
		timeSignature: { numerator: 3, denominator: 4 },
		loopRange: { startBar: 0, endBar: 1 },
		bars: [
			createBar(undefined, [createSlot('Cm7', 3)]),
			createBar(undefined, [createSlot('F7', 1.5), createSlot('Bbmaj7', 1.5)])
		]
	});

describe('draft round trip', () => {
	it('restores exactly what was on the canvas', () => {
		const { storage } = fakeStorage();
		const original = song();
		expect(writeDraft(storage, original)).toBe(true);
		const back = readDraft(storage)!;
		expect(back.name).toBe('Blue Monday-ish');
		expect(back.tempo).toBe(132);
		expect(back.timeSignature).toEqual({ numerator: 3, denominator: 4 });
		expect(back.loopRange).toEqual({ startBar: 0, endBar: 1 });
		expect(back.bars.map((b) => b.slots.map((s) => [s.chord, s.beats]))).toEqual([
			[['Cm7', 3]],
			[
				['F7', 1.5],
				['Bbmaj7', 1.5]
			]
		]);
	});

	// The id is what makes Ctrl+S update the library entry you started from,
	// rather than saving a duplicate after every reload.
	it('keeps the song’s identity', () => {
		const { storage } = fakeStorage();
		const original = song();
		writeDraft(storage, original);
		const back = readDraft(storage)!;
		expect(back.id).toBe(original.id);
		expect(back.createdAt).toBe(original.createdAt);
	});

	it('returns null when there is no draft yet', () => {
		expect(readDraft(fakeStorage().storage)).toBeNull();
	});
});

describe('a bad draft never stops the app opening', () => {
	it('drops unparseable JSON and starts clean', () => {
		const { storage, data } = fakeStorage();
		data.set(DRAFT_KEY, '{"bars": [not json');
		expect(readDraft(storage)).toBeNull();
		// Removed, so the next launch doesn't trip over it again.
		expect(data.has(DRAFT_KEY)).toBe(false);
	});

	it('drops JSON that is not a song object', () => {
		for (const junk of ['null', '42', '"text"', '[]', 'true']) {
			const { storage } = fakeStorage();
			storage.setItem(DRAFT_KEY, junk);
			expect(readDraft(storage)).toBeNull();
		}
	});

	// Routed through migrateProgression like every other read: the scheduler
	// turns beats into MIDI ticks, and a zero duration corrupts them.
	it('makes hostile values safe', () => {
		const { storage } = fakeStorage();
		storage.setItem(
			DRAFT_KEY,
			JSON.stringify({
				tempo: 99999,
				timeSignature: { numerator: 0, denominator: 7 },
				bars: [{ slots: [{ chord: 'C', beats: 0 }, { chord: 'G', beats: -4 }] }]
			})
		);
		const back = readDraft(storage)!;
		expect(back.tempo).toBeLessThanOrEqual(300);
		expect([2, 4, 8, 16]).toContain(back.timeSignature.denominator);
		for (const slot of back.bars.flatMap((b) => b.slots)) expect(slot.beats).toBeGreaterThan(0);
	});

	it('survives storage that throws on read (privacy mode)', () => {
		expect(readDraft(fakeStorage({ failGet: true }).storage)).toBeNull();
	});

	it('reports, rather than throws, when storage is full', () => {
		expect(writeDraft(fakeStorage({ failSet: true }).storage, song())).toBe(false);
	});
});

describe('isBlank', () => {
	it('is true for a fresh sketch', () => {
		expect(isBlank(createProgression())).toBe(true);
	});

	it('treats whitespace-only slots as empty', () => {
		const p = createProgression({ bars: [createBar(undefined, [createSlot('   ', 4)])] });
		expect(isBlank(p)).toBe(true);
	});

	it('is false as soon as there is one chord', () => {
		const p = createProgression({
			bars: [createBar(), createBar(undefined, [createSlot('', 2), createSlot('D7', 2)])]
		});
		expect(isBlank(p)).toBe(false);
	});
});
