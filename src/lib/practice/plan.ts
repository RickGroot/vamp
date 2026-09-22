// A resolved drill -> a PlaybackPlan the engine can start.
//
// Every repetition is baked into ONE plan. Regenerating per repetition (what
// Sketch's key-cycle drill does) means transport.stop() + cancel() + position=0
// at every key change — an audible seam in the one place a drill must not have
// one — and it re-awaits the instrument caches each time, so a single evicted
// sample drops the player to 'stopped' mid-session. A twelve-key drill is simply
// a twelve-times-longer loop.
//
// It also means no Progression is ever mutated, so none of the transient
// snapshot/restore machinery in the progression store applies here.
//
// Pure: no `tone`, no stores.

import { buildCompEvents, type CompEvent } from '$lib/audio/comp';
import { countInFor, type PlaybackPlan } from '$lib/audio/plan';
import { barBeats, beatsToQuarters } from '$lib/model/time';
import type { ClickFeel } from '$lib/audio/drills';
import type { DrumStyle, Groove, InstrumentId } from '$lib/model/types';
import { concertMidi } from './resolve';
import type { DrillRun } from './types';

/** What plays underneath the drill line. */
export type DrillBacking = 'none' | 'click' | 'drums';

export interface DrillPlanOptions {
	backing: DrillBacking;
	clickFeel: ClickFeel;
	drumStyle: DrumStyle;
	/** The sampled voice the lead line uses when it is audible. */
	instrument: InstrumentId;
	countIn: boolean;
}

/**
 * Build the backing with the SAME event builder the songs use. Passing no comp
 * slots is already "click and drums, no chords" — the groove branches are gated
 * on the groove itself — so a drill needs no new code in comp.ts.
 */
function backingEvents(
	run: DrillRun,
	opts: DrillPlanOptions,
	totalQuarters: number
): CompEvent[] {
	const groove: Groove = {
		pattern: 'block',
		bass: 'none',
		bassInstrument: 'keys',
		metronome: opts.backing === 'click' || opts.backing === 'drums',
		drums: opts.backing === 'drums' ? opts.drumStyle : 'none'
	};
	if (opts.backing === 'none') return [];
	return buildCompEvents([], totalQuarters, run.definition.timeSignature, groove, opts.clickFeel);
}

export function drillPlan(run: DrillRun, opts: DrillPlanOptions): PlaybackPlan {
	const ts = run.definition.timeSignature;
	const offset = run.options.offset;

	// The drill line. Notes are WRITTEN pitch, so playback converts back to
	// concert — the single offset seam, applied here and nowhere else.
	//
	// A rest still emits an event with `midi: []`: it carries a cueIndex, so the
	// runner's highlight and progress keep advancing through the rest, exactly
	// like a rest slot in a song.
	const lead: CompEvent[] = run.notes.map((note, i) => ({
		atQuarters: note.atQuarters,
		durQuarters: note.durQuarters,
		midi: note.midi === null ? [] : [concertMidi(note.midi, offset)],
		kind: 'lead',
		// NEVER set slotIndex: that is the flattenSlots global index the editor's
		// chord highlight keys on, and a drill setting it would light up the user's
		// song. cueIndex is the separate channel for generated plans.
		slotIndex: null,
		cueIndex: i
	}));

	const totalQuarters = run.totalQuarters;
	return {
		source: 'drill',
		events: [...lead, ...backingEvents(run, opts, totalQuarters)],
		totalQuarters,
		// The plan's starting tempo; later repetitions step it live via setTempo,
		// which needs no restart because note duration is derived from the current
		// bpm inside the Part callback.
		tempo: run.phrases[0]?.tempo ?? run.options.tempo,
		quartersPerBar: beatsToQuarters(barBeats(ts), ts),
		voices: { chords: opts.instrument, bass: null, drums: opts.backing === 'drums' },
		countIn: opts.countIn ? countInFor(ts) : null
	};
}
