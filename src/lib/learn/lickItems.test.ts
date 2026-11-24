import { describe, it, expect } from 'vitest';
import { BUILT_IN_LICKS, lickById } from '$lib/licks/library';
import { CATALOGUE, callItemId, catalogueItemById, isItemIdSafe, itemLabel, kindTitle, LICK_ITEMS, lickFor } from './lickItems';
import { QUIZ_ITEMS } from './items';

// Item ids are PERSISTED: add, never rename.
const SHIPPED = [
	'call-blues-thirds',
	'call-blues-minor',
	'call-rock-mixolydian',
	'call-rock-minor-pent',
	'call-jazz-251-major',
	'call-jazz-251-minor',
	'call-jazz-maj7-ninth',
	'call-jazz-flat-nine'
];

describe('LICK_ITEMS', () => {
	it('ids are persisted: add, never rename', () => {
		expect(LICK_ITEMS.map((i) => i.id)).toEqual(SHIPPED);
	});
	it('every id passes the storage pattern (a literal copy of it)', () => {
		for (const i of LICK_ITEMS) expect(/^[a-z0-9][a-z0-9-]{0,63}$/.test(i.id)).toBe(true);
	});
	it('every id is callItemId of its lick, with no colon, uppercase or underscore', () => {
		for (const i of LICK_ITEMS) {
			expect(i.id).toBe(callItemId(i.spec.lickId));
			expect(i.id).not.toMatch(/[:A-Z_]/);
			expect(i.id.length).toBeLessThanOrEqual(64);
		}
		expect(callItemId('lick-blues-thirds')).toBe('call-blues-thirds');
		expect(callItemId('my-lick')).toBe('call-my-lick');
	});
	it('ids are unique and collide with no quiz item', () => {
		const ids = CATALOGUE.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(CATALOGUE).toHaveLength(QUIZ_ITEMS.length + LICK_ITEMS.length);
	});
	it('names an existing lick, and every built-in lick has exactly one item', () => {
		for (const i of LICK_ITEMS) expect(lickById(i.spec.lickId)).toBeDefined();
		for (const l of BUILT_IN_LICKS) expect(LICK_ITEMS.filter((i) => i.spec.lickId === l.id)).toHaveLength(1);
	});
	it('the title is the lick name; the lede is one short sentence without digits', () => {
		for (const i of LICK_ITEMS) {
			expect(i.title).toBe(lickById(i.spec.lickId)!.name);
			expect(i.lede.split(/\s+/).length).toBeLessThanOrEqual(12);
			expect(i.lede).not.toMatch(/\d/);
			expect(i.lede).not.toMatch(/:/);
			expect(i.lede.match(/[.!?]/g)).toHaveLength(1);
			expect(i.lede.endsWith('.')).toBe(true);
		}
	});
	it('a 70-character id is unsafe; a colon id is unsafe', () => {
		expect(isItemIdSafe('a'.repeat(70))).toBe(false);
		expect(isItemIdSafe('lick:lick-blues-thirds')).toBe(false);
		expect(isItemIdSafe('call-blues-thirds')).toBe(true);
	});
	it('helpers: lookup, label, kind title', () => {
		for (const i of LICK_ITEMS) {
			expect(catalogueItemById(i.id)).toBe(i);
			expect(itemLabel(i)).toBe(lickById(i.spec.lickId)!.name);
			expect(kindTitle(i)).toBe('Licks, by ear');
		}
		const gone = { ...LICK_ITEMS[0], spec: { kind: 'lick' as const, lickId: 'lick-gone' } };
		expect(lickFor(gone)).toBeUndefined();
		expect(itemLabel(gone)).toBe(gone.title);
		expect(catalogueItemById('nope')).toBeNull();
		expect(kindTitle(QUIZ_ITEMS[0])).toBeTruthy();
	});
});
