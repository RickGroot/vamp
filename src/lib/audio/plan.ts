// The engine's input contract.
//
// A PlaybackPlan is everything needed to schedule one pass: events in quarter
// notes, tempo, meter, the sampled voices to preload, and an optional count-in.
// A pass loops by default; a Learn question plays once (`loop: false`) and the
// engine stops by itself after it. Nothing here references a Progression, so a
// generated practice drill or a quiz can build one too — the engine stays the
// only owner of the single Tone Transport without also being the only thing
// that knows about songs.
//
// Pure: no `tone`, no stores. The arithmetic the engine used to do inline lives
// here so it is unit-testable in node.

import type { BassInstrumentId, InstrumentId, TimeSignature } from '$lib/model/types';
import { barBeats, beatsToQuarters } from '$lib/model/time';
import type { CompEvent } from './comp';

/**
 * What is currently on the transport. There is one shared engine, so stores that
 * own callbacks must be able to tell "my song" from "a drill" from "a Learn
 * question" — see the `onDrillLoop` / `isPlayingThis` guards in the progression
 * store. Required (not optional) so a future plan producer cannot forget to
 * declare itself.
 */
export type PlaybackSource = 'progression' | 'drill' | 'learn';

/**
 * How a plan takes the band mix. `live` (the default) follows the Band panel:
 * mute / solo / faders, trade-fours and the drill's lead gain. `full` ignores
 * all of it — a quiz must sound the same whatever was left soloed in Sketch or
 * muted for "play it yourself" in Practice.
 */
export type PlanMixMode = 'live' | 'full';

/** Sampled voices a plan needs loaded before the transport starts. */
export interface PlanVoices {
	/** Chord/lead instrument. Always loaded — it is the fallback for every melodic lane. */
	chords: InstrumentId;
	/**
	 * Dedicated bass voice, or null to route bass through `chords` (the 'keys'
	 * mode) or to play no bass at all. Typed without 'keys' so the *adapter* is
	 * forced to resolve that choice and the engine can just ask "is there one?".
	 */
	bass: Exclude<BassInstrumentId, 'keys'> | null;
	/** Load the TR-808 kit. */
	drums: boolean;
}

/** A one-off metronome pre-roll: `beats` clicks, `quartersPerBeat` apart. */
export interface CountIn {
	beats: number;
	quartersPerBeat: number;
}

export interface PlaybackPlan {
	source: PlaybackSource;
	/** Ordered events for one loop, positioned in QUARTER NOTES (engine → ticks). */
	events: CompEvent[];
	/** Loop length in quarter notes (the loop boundary). */
	totalQuarters: number;
	/** Starting tempo (BPM = quarter notes per minute). Live-changeable after start. */
	tempo: number;
	/** Bar length in quarters — drives the trade-fours windows. */
	quartersPerBar: number;
	voices: PlanVoices;
	countIn: CountIn | null;
	/**
	 * Loop the pass (default) or play it once, after which the engine stops by
	 * itself (and `engine.ended` reads true). Repeats are unrolled into `events`
	 * by the producer, never left to the transport — the same rule as a drill's
	 * pre-generated repetitions.
	 */
	loop?: boolean;
	/** Band-mix handling; omitted = `live`. */
	mix?: PlanMixMode;
}

/** The one-bar pre-roll for a meter (6/8 → 6 clicks half a quarter apart). */
export function countInFor(ts: TimeSignature): CountIn {
	return { beats: barBeats(ts), quartersPerBeat: beatsToQuarters(1, ts) };
}
