// Factory helpers for creating model objects with stable ids and sane defaults.

import { barBeats } from './time';
import {
	CURRENT_SCHEMA_VERSION,
	type Bar,
	type Groove,
	type Progression,
	type Slot,
	type TimeSignature
} from './types';

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 };
export const DEFAULT_TEMPO = 100;
export const DEFAULT_GROOVE: Groove = {
	pattern: 'block',
	bass: 'none',
	metronome: false,
	drums: 'none'
};

export const newId = (): string => crypto.randomUUID();

export function createSlot(chord = '', beats = 4): Slot {
	return { id: newId(), chord, beats };
}

/** A bar with a single full-length slot by default. */
export function createBar(ts: TimeSignature = DEFAULT_TIME_SIGNATURE, slots?: Slot[]): Bar {
	return { id: newId(), slots: slots ?? [createSlot('', barBeats(ts))] };
}

/** Two half-bar slots (each numerator/2 beats). */
export function halfBarSlots(ts: TimeSignature): Slot[] {
	const half = barBeats(ts) / 2;
	return [createSlot('', half), createSlot('', half)];
}

export function createProgression(partial?: Partial<Progression>): Progression {
	const now = Date.now();
	const timeSignature = partial?.timeSignature ?? DEFAULT_TIME_SIGNATURE;
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		id: partial?.id ?? newId(),
		name: partial?.name ?? 'Untitled progression',
		createdAt: partial?.createdAt ?? now,
		updatedAt: now,
		tempo: partial?.tempo ?? DEFAULT_TEMPO,
		timeSignature,
		instrument: partial?.instrument ?? 'piano',
		groove: partial?.groove ?? { ...DEFAULT_GROOVE },
		bars: partial?.bars ?? [createBar(timeSignature), createBar(timeSignature)],
		loopRange: partial?.loopRange ?? null
	};
}
