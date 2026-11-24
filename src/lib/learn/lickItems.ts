// The Licks catalogue for Learn (call and response): one review item per
// built-in lick. Kept apart from QUIZ_ITEMS because a lick is not a question
// made by `makeQuestion`; the two meet in CATALOGUE, which is what progress,
// review and the backup consult.
//
// Item ids are PERSISTED (progress is keyed by them) and pass the same strict
// pattern as every other id in storage/learn.ts: lowercase words and dashes, so
// `call-<slug>`, never `lick:<id>`, which would be dropped on read.
//
// Pure.

import { lickById } from '$lib/licks/library';
import type { LickDefinition } from '$lib/licks/types';
import { KIND_TITLES, QUIZ_ITEMS, type QuizItem, type QuizKind } from './items';

export interface LickItem {
	/** Persisted. Never rename; add a new id. */
	id: string;
	/** Equals the lick's own name. */
	title: string;
	/** One short sentence: what to listen for. */
	lede: string;
	spec: { kind: 'lick'; lickId: string };
}

export type CatalogueItem = QuizItem | LickItem;

export const LICK_KIND_TITLE = 'Licks, by ear';

/** The id a lick's review item has: 'lick-blues-thirds' -> 'call-blues-thirds'. */
export const callItemId = (lickId: string): string => 'call-' + lickId.replace(/^lick-/, '');

const item = (lickId: string, title: string, lede: string): LickItem => ({
	id: callItemId(lickId),
	title,
	lede,
	spec: { kind: 'lick', lickId }
});

export const LICK_ITEMS: LickItem[] = [
	item('lick-blues-thirds', 'Minor third to major', 'Hear the minor third slide up to the major.'),
	item('lick-blues-minor', 'Minor blues falls', 'A falling minor pentatonic line, answered over the minor four chord.'),
	item('lick-rock-mixolydian', 'Flat seven rock line', 'Listen for the flat seven when the chord steps down.'),
	item('lick-rock-minor-pent', 'Minor pentatonic riff', 'A riff that climbs the minor pentatonic and settles home.'),
	item('lick-jazz-251-major', 'Major two-five-one line', 'Follow the line through the two, five and one chords.'),
	item('lick-jazz-251-minor', 'Minor two-five-one line', 'Hear the half-diminished chord resolve to a minor home.'),
	item('lick-jazz-maj7-ninth', 'Major seventh up to the ninth', 'Up the major seventh to its ninth, then back down.'),
	item('lick-jazz-flat-nine', 'Flat nine into home', 'Hear the flat nine fall a half step to the root.')
];

/** Everything progress, review and the backup know about. */
export const CATALOGUE: CatalogueItem[] = [...QUIZ_ITEMS, ...LICK_ITEMS];

const BY_ID = new Map<string, CatalogueItem>(CATALOGUE.map((i) => [i.id, i]));

export const catalogueItemById = (id: string): CatalogueItem | null => BY_ID.get(id) ?? null;

export const isLickItem = (i: CatalogueItem): i is LickItem => i.spec.kind === 'lick';

/**
 * The lick an item is about: a built-in, or one from `custom` (later phases).
 * The built-in wins here (ids are shipped and pinned); Practice resolves a saved
 * custom drill first, but a custom lick can never reuse a built-in `lick-` id
 * for a review item whose progress is keyed by it.
 */
export function lickFor(i: LickItem, custom: readonly LickDefinition[] = []): LickDefinition | undefined {
	return lickById(i.spec.lickId) ?? custom.find((l) => l.id === i.spec.lickId);
}

/** The same pattern storage/learn.ts reads ids with. */
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const isItemIdSafe = (id: string): boolean => SAFE_ID.test(id);

/** What to call an item in a list: a lick by its lick's name, falling back to the title. */
export function itemLabel(i: CatalogueItem, custom: readonly LickDefinition[] = []): string {
	return isLickItem(i) ? (lickFor(i, custom)?.name ?? i.title) : i.title;
}

/** The group heading for an item. */
export function kindTitle(i: CatalogueItem): string {
	return isLickItem(i) ? LICK_KIND_TITLE : KIND_TITLES[i.spec.kind as QuizKind];
}
