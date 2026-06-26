// Instrument loading via smplr, sharing Tone's AudioContext.
//
// v1 sounds (sampled): piano + Rhodes/EP from smplr's dedicated sample sets,
// guitar + pad from the FluidR3_GM soundfont. Soundfont voices are "decent, not
// studio-grade" — flagged as a known quality ceiling for the PoC.
//
// NOTE (offline): smplr defaults to a remote sample CDN. Self-hosting + caching
// for true offline is handled in the PWA phase; this module centralises creation
// so the sample source can be overridden in one place later.

import { DrumMachine, ElectricPiano, SplendidGrandPiano, Soundfont } from 'smplr';
import type { InstrumentId } from '$lib/model/types';
import { getRawContext } from './context';

/** The subset of the smplr instrument surface the engine relies on. */
export interface LoadedInstrument {
	start(opts: { note: number; time?: number; duration?: number; velocity?: number }): unknown;
	stop(target?: { time?: number } | number): void;
	load: Promise<unknown>;
	output?: { volume: number };
}

export interface LoadedDrums {
	start(opts: { note: string | number; time?: number; velocity?: number }): unknown;
	load: Promise<unknown>;
}

// Map the generic drum names used by comp.ts to TR-808 sample names.
const DRUM_NOTE: Record<string, string> = {
	kick: 'kick',
	snare: 'snare',
	hihat: 'hihat-close'
};

export function drumSampleName(generic: string): string {
	return DRUM_NOTE[generic] ?? generic;
}

let drumMachine: LoadedDrums | null = null;

/** Create a drum machine bound to a given context (e.g. offline render). */
export function createDrums(ctx: BaseAudioContext): LoadedDrums {
	return new DrumMachine(ctx, { instrument: 'TR-808' }) as unknown as LoadedDrums;
}

/** Lazily create + load the shared (live) drum machine. */
export async function getDrumMachine(): Promise<LoadedDrums> {
	if (!drumMachine) drumMachine = createDrums(getRawContext());
	await drumMachine.load;
	return drumMachine;
}

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
	piano: 'Grand piano',
	guitar: 'Acoustic guitar',
	rhodes: 'Electric piano',
	pad: 'Warm pad'
};

export const INSTRUMENT_ORDER: InstrumentId[] = ['piano', 'guitar', 'rhodes', 'pad'];

const cache = new Map<InstrumentId, LoadedInstrument>();

/** Create a melodic instrument bound to a given context (e.g. offline render). */
export function createInstrument(id: InstrumentId, ctx: BaseAudioContext): LoadedInstrument {
	switch (id) {
		case 'piano':
			return new SplendidGrandPiano(ctx) as unknown as LoadedInstrument;
		case 'rhodes':
			return new ElectricPiano(ctx, { instrument: 'WurlitzerEP200' }) as unknown as LoadedInstrument;
		case 'guitar':
			return new Soundfont(ctx, {
				instrument: 'acoustic_guitar_nylon',
				kit: 'FluidR3_GM'
			}) as unknown as LoadedInstrument;
		case 'pad':
			return new Soundfont(ctx, {
				instrument: 'pad_2_warm',
				kit: 'FluidR3_GM'
			}) as unknown as LoadedInstrument;
	}
}

/**
 * Get an instrument, creating it and awaiting its samples on first use.
 * Subsequent calls return the cached, already-loaded instance.
 */
export async function getInstrument(id: InstrumentId): Promise<LoadedInstrument> {
	let inst = cache.get(id);
	if (!inst) {
		inst = createInstrument(id, getRawContext());
		cache.set(id, inst);
	}
	await inst.load;
	return inst;
}

/** Whether an instrument has been created and loaded already. */
export function isInstrumentReady(id: InstrumentId): boolean {
	return cache.has(id);
}
