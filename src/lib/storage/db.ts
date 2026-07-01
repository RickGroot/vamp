// Local persistence for progressions via IndexedDB (idb wrapper).
//
// - DB structural version (DB_VERSION) drives object-store migrations in upgrade().
// - Per-record `schemaVersion` drives data-shape migrations in migrateProgression().
// - Everything is defensive: loaded/imported data is coerced to the current shape
//   so a malformed or older record can never crash the editor.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
	CURRENT_SCHEMA_VERSION,
	type Bar,
	type BassMode,
	type CompPattern,
	type DrumStyle,
	type Groove,
	type InstrumentId,
	type Progression,
	type Slot,
	type TimeSignature,
	type VampBackup
} from '$lib/model/types';
import { createBar, newId, DEFAULT_TEMPO, DEFAULT_TIME_SIGNATURE } from '$lib/model/factory';
import { INSTRUMENT_ORDER } from '$lib/audio/instruments';
import { parseProgressionInput } from './import';

const DB_NAME = 'vamp';
const DB_VERSION = 1;
const STORE = 'progressions';

interface VampDB extends DBSchema {
	progressions: {
		key: string;
		value: Progression;
		indexes: { updatedAt: number };
	};
	meta: {
		key: string;
		value: { key: string; value: number };
	};
}

let dbPromise: Promise<IDBPDatabase<VampDB>> | null = null;

function getDb(): Promise<IDBPDatabase<VampDB>> {
	if (!dbPromise) {
		dbPromise = openDB<VampDB>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				// Fall-through migrations: each block upgrades from the version below it.
				if (oldVersion < 1) {
					const store = db.createObjectStore(STORE, { keyPath: 'id' });
					store.createIndex('updatedAt', 'updatedAt');
					db.createObjectStore('meta', { keyPath: 'key' });
				}
				// if (oldVersion < 2) { ...future structural changes... }
			}
		});
	}
	return dbPromise;
}

let persistenceRequested = false;

/** Ask the browser to keep our storage from being evicted (best-effort). */
async function requestPersistence(): Promise<void> {
	if (persistenceRequested) return;
	persistenceRequested = true;
	try {
		if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
			await navigator.storage.persist();
		}
	} catch {
		/* non-fatal */
	}
}

export async function saveProgression(progression: Progression): Promise<void> {
	await requestPersistence();
	const db = await getDb();
	await db.put(STORE, { ...progression, updatedAt: Date.now() });
}

/** All saved progressions, newest-updated first. */
export async function listProgressions(): Promise<Progression[]> {
	const db = await getDb();
	const all = await db.getAllFromIndex(STORE, 'updatedAt');
	return all.reverse();
}

export async function loadProgression(id: string): Promise<Progression | undefined> {
	const db = await getDb();
	return db.get(STORE, id);
}

export async function deleteProgression(id: string): Promise<void> {
	const db = await getDb();
	await db.delete(STORE, id);
}

// ---- export / import ----

export async function exportBackup(): Promise<VampBackup> {
	const progressions = await listProgressions();
	return {
		app: 'vamp',
		schemaVersion: CURRENT_SCHEMA_VERSION,
		exportedAt: Date.now(),
		progressions
	};
}

/**
 * Parse, migrate and store pasted / uploaded progression JSON. Forgiving about
 * shape (a Vamp backup, a bare progression, an array, or fenced/prose-wrapped
 * text — see parseProgressionInput). Returns the migrated progressions stored.
 * Throws a human-readable Error the UI surfaces on failure.
 */
export async function importProgressions(text: string): Promise<Progression[]> {
	const migrated = parseProgressionInput(text).map(migrateProgression);
	const db = await getDb();
	const tx = db.transaction(STORE, 'readwrite');
	await Promise.all(migrated.map((p) => tx.store.put(p)));
	await tx.done;
	return migrated;
}

// ---- defensive migration / coercion ----

/** Bring any stored or imported record up to the current schema, with safe defaults. */
export function migrateProgression(raw: unknown): Progression {
	const r = (raw ?? {}) as Record<string, unknown>;
	// Future: switch on r.schemaVersion to transform older shapes before coercion.
	const now = Date.now();
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		id: typeof r.id === 'string' ? r.id : newId(),
		name: typeof r.name === 'string' ? r.name : 'Untitled progression',
		createdAt: toNumber(r.createdAt, now),
		updatedAt: toNumber(r.updatedAt, now),
		tempo: toNumber(r.tempo, DEFAULT_TEMPO),
		timeSignature: coerceTimeSignature(r.timeSignature),
		instrument: coerceInstrument(r.instrument),
		groove: coerceGroove(r.groove),
		bars: Array.isArray(r.bars) && r.bars.length > 0 ? r.bars.map(coerceBar) : [createBar()],
		loopRange: coerceLoopRange(r.loopRange)
	};
}

function toNumber(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function coerceTimeSignature(value: unknown): TimeSignature {
	const v = (value ?? {}) as Record<string, unknown>;
	const numerator = toNumber(v.numerator, DEFAULT_TIME_SIGNATURE.numerator);
	const denominator = toNumber(v.denominator, DEFAULT_TIME_SIGNATURE.denominator);
	return {
		numerator: numerator > 0 ? numerator : DEFAULT_TIME_SIGNATURE.numerator,
		denominator: denominator > 0 ? denominator : DEFAULT_TIME_SIGNATURE.denominator
	};
}

function coerceInstrument(value: unknown): InstrumentId {
	return INSTRUMENT_ORDER.includes(value as InstrumentId) ? (value as InstrumentId) : 'piano';
}

function coerceGroove(value: unknown): Groove {
	const v = (value ?? {}) as Record<string, unknown>;
	const pattern: CompPattern =
		v.pattern === 'strum' || v.pattern === 'arpeggio' ? v.pattern : 'block';
	const drumStyles: DrumStyle[] = ['none', 'rock', 'pop', 'swing', 'bossa'];
	const drums = drumStyles.includes(v.drums as DrumStyle) ? (v.drums as DrumStyle) : 'none';
	return { pattern, bass: coerceBass(v.bass), metronome: v.metronome === true, drums };
}

const BASS_MODES: BassMode[] = ['none', 'root', 'alt', 'walking', 'octaves'];
function coerceBass(value: unknown): BassMode {
	if (value === true) return 'root'; // legacy boolean: on → simple root bass
	if (BASS_MODES.includes(value as BassMode)) return value as BassMode;
	return 'none';
}

function coerceBar(value: unknown): Bar {
	const v = (value ?? {}) as Record<string, unknown>;
	const slots = Array.isArray(v.slots) && v.slots.length > 0 ? v.slots.map(coerceSlot) : [coerceSlot({})];
	return { id: typeof v.id === 'string' ? v.id : newId(), slots };
}

function coerceSlot(value: unknown): Slot {
	const v = (value ?? {}) as Record<string, unknown>;
	return {
		id: typeof v.id === 'string' ? v.id : newId(),
		chord: typeof v.chord === 'string' ? v.chord : '',
		beats: toNumber(v.beats, 4)
	};
}

function coerceLoopRange(value: unknown): Progression['loopRange'] {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	const startBar = Number(v.startBar);
	const endBar = Number(v.endBar);
	if (!Number.isFinite(startBar) || !Number.isFinite(endBar)) return null;
	return { startBar, endBar };
}
