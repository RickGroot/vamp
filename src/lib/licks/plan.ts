// What a lick adds to drillPlan: the band under the line, and swing.
//
// The band is built the way learnPlan builds a passage: the run's changes
// (already unrolled per key, every repetition starting on a barline) packed into
// bars of a throwaway Progression, then the song's own schedule and comp path —
// the same voicing, comp patterns and bass as Sketch. Two things make it a drill's
// backing rather than a song:
// - every event loses its slotIndex (and never gains a cueIndex). slotIndex is
//   the editor's highlight channel; left in, a lick would light chords in the
//   user's song. cueIndex belongs to the line alone, so the runner's cue only
//   follows notes;
// - the groove comes from the lick's style, not from the user's song.
//
// Swing moves the LINE only, at playback: an eighth on the off-beat lands where
// the swing hi-hat does (SWING_OFFBEAT). The run's notes — and so the staff —
// stay straight, as swing is written.
//
// Pure: no tone, no stores.

import { buildCompEvents, SWING_OFFBEAT, type CompEvent } from '$lib/audio/comp';
import type { ClickFeel } from '$lib/audio/drills';
import { progressionPlan } from '$lib/audio/schedule';
import { packBars } from '$lib/learn/plan';
import { createBar, createProgression, createSlot } from '$lib/model/factory';
import type { BassInstrumentId, Groove, InstrumentId, TimeSignature } from '$lib/model/types';
import type { DrillBacking } from '$lib/practice/plan';
import type { LickRun, LickStyle } from './types';

/** The band each style plays in. Comping stays block chords: one clear attack per change. */
export const LICK_GROOVES: Record<LickStyle, Groove> = {
	jazz: { pattern: 'block', bass: 'walking', bassInstrument: 'upright', metronome: false, drums: 'swing' },
	blues: { pattern: 'block', bass: 'root', bassInstrument: 'upright', metronome: false, drums: 'swing' },
	rock: { pattern: 'block', bass: 'root', bassInstrument: 'electric', metronome: false, drums: 'rock' }
};

/**
 * The style's groove for one backing choice. Chords and bass always play — a
 * lick is learned over its changes. 'click' adds the metronome, 'drums' the
 * style's kit (the kit keeps time, so no click on top), 'none' is the band alone.
 */
export function lickGroove(style: LickStyle, backing: DrillBacking): Groove {
	const base = LICK_GROOVES[style] ?? LICK_GROOVES.jazz;
	return {
		...base,
		metronome: backing === 'click',
		drums: backing === 'drums' ? base.drums : 'none'
	};
}

export interface LickBacking {
	events: CompEvent[];
	/** The bass voice to load: null when the bass is off or goes through the chord instrument. */
	bass: Exclude<BassInstrumentId, 'keys'> | null;
	drums: boolean;
}

/** The band under a lick run: chords, bass and the backing's click or kit. */
export function lickBacking(
	run: LickRun,
	ts: TimeSignature,
	backing: DrillBacking,
	clickFeel: ClickFeel,
	instrument: InstrumentId
): LickBacking {
	const groove = lickGroove(run.definition.style, backing);
	const bars = packBars(run.chords, ts).map((packed) =>
		createBar(
			ts,
			packed.map((s) => createSlot(s.symbol, s.beats))
		)
	);
	if (bars.length === 0) {
		// Nothing resolved (every key skipped): just the click or kit, if any.
		return {
			events: buildCompEvents([], run.totalQuarters, ts, groove, clickFeel),
			bass: null,
			drums: groove.drums !== 'none'
		};
	}
	const song = createProgression({
		name: 'Lick',
		timeSignature: ts,
		instrument,
		groove,
		bars,
		loopRange: null
	});
	const plan = progressionPlan(song, { clickFeel });
	const events = plan.events.map((e) => {
		const { cueIndex: _cue, ...rest } = e;
		return { ...rest, slotIndex: null };
	});
	return { events, bass: plan.voices.bass, drums: plan.voices.drums };
}

const EPS = 1e-9;

/**
 * Swing time: within each beat, the first half stretches to SWING_OFFBEAT and
 * the second half shrinks to fill the rest. Monotonic and continuous, so notes
 * stay in order and touching notes still touch; beats themselves don't move.
 */
export function swingTime(quarters: number): number {
	const beat = Math.floor(quarters + EPS);
	const frac = Math.max(0, quarters - beat);
	if (frac <= 0.5) return beat + frac * (SWING_OFFBEAT / 0.5);
	return beat + SWING_OFFBEAT + (frac - 0.5) * ((1 - SWING_OFFBEAT) / 0.5);
}

/**
 * The line's events swung: an off-beat eighth starts at SWING_OFFBEAT and the
 * on-beat note before it stretches to meet it. Only for meters counted in
 * quarters or halves — in 6/8 the eighths are the beat and there is nothing
 * to swing.
 */
export function swingLead(events: CompEvent[], ts: TimeSignature): CompEvent[] {
	if (ts.denominator > 4) return events;
	return events.map((e) => {
		const at = swingTime(e.atQuarters);
		const end = swingTime(e.atQuarters + e.durQuarters);
		return { ...e, atQuarters: at, durQuarters: end - at };
	});
}
