import { describe, it, expect } from 'vitest';
import { createProgression } from '$lib/model/factory';
import { backupExtras, importMessage, salvaged, type ImportSummary } from './importSummary';

const song = (name: string) => createProgression({ name });
const summary = (over: Partial<ImportSummary>): ImportSummary => ({ songs: [], drills: 0, learn: null, ...over });

describe('backupExtras', () => {
	it('reads drills and learn from an envelope', () => {
		const text = JSON.stringify({ app: 'vamp', progressions: [], drills: [{ id: 'x' }], learn: { items: {} } });
		expect(backupExtras(text)).toEqual({ drills: [{ id: 'x' }], learn: { items: {} } });
	});

	it('has none for a pre-Learn backup, prose, a bare list or broken JSON', () => {
		expect(backupExtras(JSON.stringify({ app: 'vamp', progressions: [] }))).toEqual({ drills: null, learn: undefined });
		for (const text of ['', 'not json', '```json\n{"bars": []}\n```', '[{"bars": []}]', '42', 'null', '{"drills": "x"}']) {
			const out = backupExtras(text);
			expect(out.drills, text).toBeNull();
			expect(out.learn, text).toBeUndefined();
		}
	});

	it('passes a learn field on as it is, even null, for storage/learn.ts to coerce', () => {
		expect(backupExtras('{"learn": null}').learn).toBeNull();
		expect(backupExtras('{"learn": "garbage"}').learn).toBe('garbage');
		expect(backupExtras('{"__proto__": {"learn": 1}}').learn).toBeUndefined();
	});
});

describe('salvage', () => {
	it('counts drills or Learn progress as something imported', () => {
		expect(salvaged(0, null)).toBe(false);
		expect(salvaged(2, null)).toBe(true);
		expect(salvaged(0, { items: 1, lessons: 0 })).toBe(true);
	});
});

describe('importMessage', () => {
	it('names the first song and counts the rest, as before', () => {
		expect(importMessage(summary({ songs: [song('Blue Bossa')] }))).toEqual({ kind: 'ok', text: 'Imported “Blue Bossa”.' });
		expect(importMessage(summary({ songs: [song('A'), song('B'), song('C')] })).text).toBe('Imported “A” (+2 more added).');
	});

	it('adds the extras that came with the songs', () => {
		const text = importMessage(summary({ songs: [song('A')], drills: 1, learn: { items: 3, lessons: 2 } })).text;
		expect(text).toBe('Imported “A”, plus 1 custom drill and your Learn progress (3 exercises, 2 lessons).');
	});

	it('a drills-only or learn-only backup is a success, not "No songs found"', () => {
		expect(importMessage(summary({ drills: 2 }))).toEqual({
			kind: 'ok',
			text: 'Imported 2 custom drills. There were no songs in it.'
		});
		expect(importMessage(summary({ learn: { items: 1, lessons: 0 } }))).toEqual({
			kind: 'ok',
			text: 'Imported your Learn progress (1 exercise). There were no songs in it.'
		});
		expect(importMessage(summary({ learn: { items: 0, lessons: 4 } })).text).toContain('(4 lessons)');
	});

	it('says so when nothing came in', () => {
		expect(importMessage(summary({}))).toEqual({ kind: 'err', text: 'No songs found in that JSON.' });
	});
});
