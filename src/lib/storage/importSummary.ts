// What an import brought, and what to tell the user about it — the pure parts
// of importProgressions (db.ts), kept below its IndexedDB calls so they test in
// node.
//
// A Vamp backup may carry two optional extras beside its songs: `drills`
// (Practice, custom drills) and `learn` (Learn progress). Each is imported on
// its own, so a malformed one never costs the songs beside it, and a backup
// that holds only extras — no saved songs — is a successful import, not "No
// songs found".
//
// Pure: no stores, no IndexedDB.

import type { Progression } from '$lib/model/types';
import type { LearnImport } from './learn';

export interface ImportSummary {
	/** The songs stored, migrated. */
	songs: Progression[];
	/** Custom drills stored. */
	drills: number;
	/** What the backup's Learn progress held, merged into what was saved; null for none. */
	learn: LearnImport | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The extras of a backup envelope, read once and tolerantly: anything that
 * isn't a JSON object (pasted prose, a bare song list) has none. `learn` is
 * passed on as it is: storage/learn.ts coerces it.
 */
export function backupExtras(text: string): { drills: unknown[] | null; learn: unknown } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { drills: null, learn: undefined };
	}
	if (!isRecord(parsed)) return { drills: null, learn: undefined };
	return {
		drills: Array.isArray(parsed.drills) ? parsed.drills : null,
		learn: Object.prototype.hasOwnProperty.call(parsed, 'learn') ? parsed.learn : undefined
	};
}

/** Something besides songs came in, so finding no songs isn't a failure. */
export function salvaged(drills: number, learn: LearnImport | null): boolean {
	return drills > 0 || learn !== null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function list(parts: string[]): string {
	if (parts.length <= 1) return parts.join('');
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The File menu's line after an import. */
export function importMessage(summary: ImportSummary): { kind: 'ok' | 'err'; text: string } {
	const extras: string[] = [];
	if (summary.drills > 0) extras.push(plural(summary.drills, 'custom drill'));
	if (summary.learn) {
		const { items, lessons } = summary.learn;
		const held = [items > 0 ? plural(items, 'exercise') : '', lessons > 0 ? plural(lessons, 'lesson') : '']
			.filter(Boolean)
			.join(', ');
		extras.push(`your Learn progress (${held})`);
	}

	const [first, ...rest] = summary.songs;
	if (first) {
		const more = rest.length > 0 ? ` (+${rest.length} more added)` : '';
		return { kind: 'ok', text: `Imported “${first.name}”${more}${extras.length ? `, plus ${list(extras)}` : ''}.` };
	}
	if (extras.length > 0) return { kind: 'ok', text: `Imported ${list(extras)}. There were no songs in it.` };
	return { kind: 'err', text: 'No songs found in that JSON.' };
}
