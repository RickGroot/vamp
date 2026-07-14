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
	type BassInstrumentId,
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
import {
	createBar,
	newId,
	DEFAULT_TEMPO,
	DEFAULT_TIME_SIGNATURE,
	TEMPO_MIN,
	TEMPO_MAX
} from '$lib/model/factory';
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
					// Reserved for future key/value needs (created at v1 so adding them
					// later needs no version bump). Intentionally unused for now.
					db.createObjectStore('meta', { keyPath: 'key' });
				}
				// if (oldVersion < 2) { ...future structural changes... }
			}
		});
		// A failed open (private browsing, quota) must not poison every later
		// call — clear the cache so the next operation can retry.
		dbPromise.catch(() => {
			dbPromise = null;
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

/** All saved progressions, newest-updated first, migrated to the current shape. */
export async function listProgressions(): Promise<Progression[]> {
	const db = await getDb();
	const all = await db.getAllFromIndex(STORE, 'updatedAt');
	// Records may predate schema changes (e.g. Groove.bass was once a boolean) —
	// every read goes through the same migration as imports.
	return all.reverse().map(migrateProgression);
}

export async function loadProgression(id: string): Promise<Progression | undefined> {
	const db = await getDb();
	const raw = await db.get(STORE, id);
	return raw === undefined ? undefined : migrateProgression(raw);
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
		tempo: coerceTempo(r.tempo),
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

/** Positive tempo clamped to the valid range; anything else → the default. */
function coerceTempo(value: unknown): number {
	const t = toNumber(value, DEFAULT_TEMPO);
	if (t <= 0) return DEFAULT_TEMPO;
	return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(t)));
}

/**
 * Integer meter within sane bounds. Odd meters (7/8, 5/4) are valid and kept;
 * garbage (0.5, 1e9, negatives) falls back so a hostile import/share hash can't
 * freeze scheduling loops.
 */
function coerceTimeSignature(value: unknown): TimeSignature {
	const v = (value ?? {}) as Record<string, unknown>;
	const numerator = Math.round(toNumber(v.numerator, DEFAULT_TIME_SIGNATURE.numerator));
	const denominator = Math.round(toNumber(v.denominator, DEFAULT_TIME_SIGNATURE.denominator));
	return {
		numerator: numerator >= 1 && numerator <= 16 ? numerator : DEFAULT_TIME_SIGNATURE.numerator,
		denominator: [2, 4, 8, 16].includes(denominator)
			? denominator
			: DEFAULT_TIME_SIGNATURE.denominator
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
	return {
		pattern,
		bass: coerceBass(v.bass),
		bassInstrument: coerceBassInstrument(v.bassInstrument),
		metronome: v.metronome === true,
		drums
	};
}

const BASS_MODES: BassMode[] = ['none', 'root', 'alt', 'walking', 'octaves'];
function coerceBass(value: unknown): BassMode {
	if (value === true) return 'root'; // legacy boolean: on → simple root bass
	if (BASS_MODES.includes(value as BassMode)) return value as BassMode;
	return 'none';
}

const BASS_INSTRUMENTS: BassInstrumentId[] = ['keys', 'upright', 'electric', 'synth'];
function coerceBassInstrument(value: unknown): BassInstrumentId {
	// Records saved before this field default to 'upright' (a real bass sound),
	// not 'keys' — the shared-instrument bass was a limitation, not a preference.
	return BASS_INSTRUMENTS.includes(value as BassInstrumentId) ? (value as BassInstrumentId) : 'upright';
}

function coerceBar(value: unknown): Bar {
	const v = (value ?? {}) as Record<string, unknown>;
	const slots = Array.isArray(v.slots) && v.slots.length > 0 ? v.slots.map(coerceSlot) : [coerceSlot({})];
	return { id: typeof v.id === 'string' ? v.id : newId(), slots };
}

function coerceSlot(value: unknown): Slot {
	const v = (value ?? {}) as Record<string, unknown>;
	// Beats must be positive and bounded: zero/negative values corrupt MIDI
	// export tick math, and huge values freeze per-beat scheduling loops.
	const b = toNumber(v.beats, 4);
	return {
		id: typeof v.id === 'string' ? v.id : newId(),
		chord: typeof v.chord === 'string' ? v.chord : '',
		beats: b > 0 && b <= 64 ? b : 4
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
