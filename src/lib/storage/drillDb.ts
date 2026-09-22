// Local persistence for custom practice drills.
//
// Mirrors db.ts's discipline exactly: every read, import and decode goes through
// `migrateDrill`, which coerces a record to the current shape with safe bounds.
// A stored drill is data the app will happily turn into MIDI tick positions, so
// a hand-edited or stale record with `beats: 0` must be made safe here rather
// than freezing the scheduler later.
//
// Must NOT import stores (the storage layer never does).

import { getDb, DRILL_STORE } from './db';
import { newId } from '$lib/model/factory';
import { SCALE_TYPES } from '$lib/model/scales';
import { isValidChordSymbol } from '$lib/audio/chord';
import {
	CURRENT_DRILL_SCHEMA_VERSION,
	type DrillDefinition,
	type DrillDirection,
	type DrillPattern,
	type DrillSource,
	type GuideLine
} from '$lib/practice/types';
import type { TimeSignature } from '$lib/model/types';

export async function saveDrill(drill: DrillDefinition): Promise<DrillDefinition> {
	const stored: DrillDefinition = { ...drill, builtIn: false, updatedAt: Date.now() };
	const db = await getDb();
	await db.put(DRILL_STORE, stored);
	return stored;
}

/** All saved drills, newest-updated first, coerced to the current shape. */
export async function listDrills(): Promise<DrillDefinition[]> {
	const db = await getDb();
	const all = await db.getAllFromIndex(DRILL_STORE, 'updatedAt');
	return all.reverse().map(migrateDrill);
}

export async function deleteDrill(id: string): Promise<void> {
	const db = await getDb();
	await db.delete(DRILL_STORE, id);
}

// ---- defensive migration / coercion ----

const SCALE_TYPE_IDS = new Set(SCALE_TYPES.map((t) => t.id));
const DIRECTIONS: DrillDirection[] = ['up', 'down', 'updown', 'downup'];
const GUIDE_LINES: GuideLine[] = ['guide', 'thirds', 'sevenths', 'roots'];

/** Slot-sized bound, matching migrateProgression's `beats` rule. */
const MAX_BEATS = 64;
/** A cell offset far outside this is a typo, and would fly out of any range. */
const MAX_STEP = 24;
const MAX_CELL_LENGTH = 32;
const MAX_CELLS_PER_KEY = 64;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const finiteInt = (v: unknown, fallback: number): number =>
	typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;

function coerceSource(raw: unknown): DrillSource {
	const r = (raw ?? {}) as Record<string, unknown>;
	if (r.kind === 'guide') {
		const line = GUIDE_LINES.includes(r.line as GuideLine) ? (r.line as GuideLine) : 'guide';
		return { kind: 'guide', line };
	}
	if (r.kind === 'chord') {
		// A quality only means anything if it makes a real chord on some root.
		const quality = typeof r.quality === 'string' ? r.quality.trim() : '';
		return { kind: 'chord', quality: isValidChordSymbol(`C${quality}`) ? quality : '' };
	}
	const scaleType =
		typeof r.scaleType === 'string' && SCALE_TYPE_IDS.has(r.scaleType) ? r.scaleType : 'major';
	return { kind: 'scale', scaleType };
}

function coercePattern(raw: unknown): DrillPattern {
	const r = (raw ?? {}) as Record<string, unknown>;
	const rawCell = Array.isArray(r.cell) ? r.cell : [];
	const cell = rawCell
		.slice(0, MAX_CELL_LENGTH)
		.map((v) => clamp(finiteInt(v, 0), -MAX_STEP, MAX_STEP));
	const rawRhythm = Array.isArray(r.rhythm) ? r.rhythm : [];
	const rhythm = rawRhythm
		.slice(0, MAX_CELL_LENGTH)
		.map((v) => {
			const beats = typeof v === 'number' && Number.isFinite(v) ? v : 1;
			// > 0 and <= 64, the same bound migrateProgression enforces on a slot:
			// a zero or negative duration corrupts tick maths and can freeze playback.
			return beats > 0 ? Math.min(beats, MAX_BEATS) : 1;
		});
	return {
		id: typeof r.id === 'string' && r.id ? r.id : 'custom',
		label: typeof r.label === 'string' && r.label ? r.label : 'Custom',
		// An empty cell would generate no notes at all — one note is the floor.
		cell: cell.length ? cell : [0],
		rhythm: rhythm.length ? rhythm : [1],
		step: clamp(finiteInt(r.step, 1), -MAX_STEP, MAX_STEP)
	};
}

function coerceTimeSignature(raw: unknown): TimeSignature {
	const r = (raw ?? {}) as Record<string, unknown>;
	const numerator = clamp(finiteInt(r.numerator, 4), 1, 16);
	const denominator = [2, 4, 8, 16].includes(finiteInt(r.denominator, 4))
		? finiteInt(r.denominator, 4)
		: 4;
	return { numerator, denominator };
}

/** Bring any stored or imported drill up to the current schema, with safe defaults. */
export function migrateDrill(raw: unknown): DrillDefinition {
	const r = (raw ?? {}) as Record<string, unknown>;
	const now = Date.now();
	const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Custom drill';
	return {
		schemaVersion: CURRENT_DRILL_SCHEMA_VERSION,
		id: typeof r.id === 'string' && r.id ? r.id : newId(),
		name,
		description: typeof r.description === 'string' ? r.description : '',
		createdAt: finiteInt(r.createdAt, now),
		updatedAt: finiteInt(r.updatedAt, now),
		source: coerceSource(r.source),
		pattern: coercePattern(r.pattern),
		direction: DIRECTIONS.includes(r.direction as DrillDirection)
			? (r.direction as DrillDirection)
			: 'up',
		cellsPerKey: clamp(finiteInt(r.cellsPerKey, 4), 1, MAX_CELLS_PER_KEY),
		timeSignature: coerceTimeSignature(r.timeSignature),
		// Anything that came off disk or out of a file is the user's, never shipped.
		builtIn: false
	};
}

/** Store drills from an imported backup. Unreadable entries are coerced, not dropped. */
export async function importDrills(raw: unknown): Promise<DrillDefinition[]> {
	if (!Array.isArray(raw)) return [];
	const migrated = raw.map(migrateDrill);
	if (migrated.length === 0) return [];
	const db = await getDb();
	const tx = db.transaction(DRILL_STORE, 'readwrite');
	await Promise.all(migrated.map((d) => tx.store.put(d)));
	await tx.done;
	return migrated;
}
