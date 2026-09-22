// Playback engine: turn a PlaybackPlan into a looping Tone.Transport schedule.
//
// There is one Tone Transport, so there is one engine. It takes a plan (plan.ts)
// rather than a Progression, so both the editor's song and a generated practice
// drill share this scheduling, mix and highlight machinery; `play()` is the thin
// Progression adapter over `start()`.
//
// For a song, chords are voiced (voicing.ts) and expanded into rhythmic events by
// the groove (comp.ts). Either way events arrive in quarter notes and are
// scheduled in transport *ticks* (PPQ-based) so tempo stays live and non-4/4
// meters work. Chords/bass/lead play through the sampled instrument; the
// metronome uses a small Tone synth. Highlights are synced to audio time via
// Tone.getDraw(), on two disjoint channels — slotIndex for songs, cueIndex for
// generated plans (see CompEvent).

import * as Tone from 'tone';
import type { Progression } from '$lib/model/types';
import { progressionPlan } from './schedule';
import { type CompEvent } from './comp';
import { type PlaybackPlan, type PlaybackSource } from './plan';
import { isComping, type MixLevels } from './mix';
import { type ClickFeel } from './drills';
import {
	getInstrument,
	getBassInstrument,
	getDrumMachine,
	drumSampleName,
	type LoadedInstrument,
	type LoadedDrums
} from './instruments';
import { unlockAudio } from './context';

export type EngineState = 'stopped' | 'loading' | 'playing';

const VELOCITY = 95;
const BASS_VELOCITY = 80;
const DRUM_VELOCITY = 80;
const DRUM_ACCENT_VELOCITY = 110;
const LEAD_VELOCITY = 100;

/** A CompEvent placed on the transport: same shape plus its tick position. */
type ScheduledEvent = CompEvent & { time: string }; // time e.g. "384i"

type StateListener = (state: EngineState) => void;
type SlotListener = (index: number | null) => void;
type CueListener = (index: number | null) => void;
type LoopListener = () => void;

class PlaybackEngine {
	private part: Tone.Part | null = null;
	private instrument: LoadedInstrument | null = null;
	private bassInstrument: LoadedInstrument | null = null;
	private drums: LoadedDrums | null = null;
	private click: Tone.Synth | null = null;
	private _state: EngineState = 'stopped';
	private loopEventId: number | null = null;
	// Cancellation token: play() awaits sample loads for seconds on first use, and
	// a stop()/newer play() during those awaits must invalidate the stale run —
	// otherwise playback starts against an explicit stop (or plays a replaced song).
	private playGen = 0;
	private readonly stateListeners = new Set<StateListener>();
	private readonly slotListeners = new Set<SlotListener>();
	private readonly cueListeners = new Set<CueListener>();
	private readonly loopListeners = new Set<LoopListener>();

	// Practice mix, read live by the Part callback so changes apply without a restart.
	private mix: MixLevels = { chords: 1, bass: 1, drums: 1 };
	private tradeBars = 0;
	private quartersPerBar = 4;
	private leadGain = 1;
	private _source: PlaybackSource = 'progression';

	get state(): EngineState {
		return this._state;
	}

	/**
	 * What is currently on the transport. There is one shared engine, so a store
	 * that owns engine callbacks must check this before acting on its own data —
	 * otherwise a drill's loop boundary drives the editor's song.
	 */
	get source(): PlaybackSource {
		return this._source;
	}

	/** Set per-lane playback gains (0..1). Applies live while playing. */
	setMix(mix: MixLevels): void {
		this.mix = mix;
	}

	/** "Trade fours" block length in bars (0 = off). Applies live while playing. */
	setTradeBars(bars: number): void {
		this.tradeBars = Math.max(0, Math.floor(bars));
	}

	/**
	 * Lead-line gain (0..1). 0 = silent, so you play the line yourself over the
	 * backing. Applies live, so listen↔play flips with no restart, no re-await of
	 * samples and no lost position.
	 */
	setLeadGain(gain: number): void {
		this.leadGain = Math.max(0, Math.min(1, gain));
	}

	get isPlaying(): boolean {
		return this._state === 'playing';
	}

	onState(fn: StateListener): () => void {
		this.stateListeners.add(fn);
		return () => this.stateListeners.delete(fn);
	}

	onActiveSlot(fn: SlotListener): () => void {
		this.slotListeners.add(fn);
		return () => this.slotListeners.delete(fn);
	}

	/**
	 * Fires when a generated plan's highlight advances (which drill note is
	 * sounding). Separate from onActiveSlot so a drill can never light up a chord
	 * slot in the user's song — see CompEvent.cueIndex.
	 */
	onActiveCue(fn: CueListener): () => void {
		this.cueListeners.add(fn);
		return () => this.cueListeners.delete(fn);
	}

	/** Fires once each time the loop wraps back to the start (for practice drills). */
	onLoop(fn: LoopListener): () => void {
		this.loopListeners.add(fn);
		return () => this.loopListeners.delete(fn);
	}

	private setState(state: EngineState): void {
		this._state = state;
		for (const fn of this.stateListeners) fn(state);
	}

	private setActiveSlot(index: number | null): void {
		for (const fn of this.slotListeners) fn(index);
	}

	private setActiveCue(index: number | null): void {
		for (const fn of this.cueListeners) fn(index);
	}

	private ensureClick(): Tone.Synth {
		if (!this.click) {
			this.click = new Tone.Synth({
				oscillator: { type: 'triangle' },
				envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 }
			}).toDestination();
			this.click.volume.value = -8;
		}
		return this.click;
	}

	/** Start (or restart) looping playback of a progression. */
	async play(
		progression: Progression,
		opts: { countIn?: boolean; clickFeel?: ClickFeel } = {}
	): Promise<void> {
		return this.start(progressionPlan(progression, opts));
	}

	/**
	 * Start (or restart) looping playback of a prepared plan. This is the only
	 * entry point that touches the transport; `play()` is the Progression adapter.
	 */
	async start(plan: PlaybackPlan): Promise<void> {
		const gen = ++this.playGen;
		await unlockAudio();
		if (gen !== this.playGen) return; // stopped/superseded while unlocking
		this.setState('loading');
		try {
			this.instrument = await getInstrument(plan.voices.chords);
			// A dedicated bass voice when the plan asks for one; otherwise the bass
			// (if any) falls back to the chord instrument.
			this.bassInstrument = plan.voices.bass ? await getBassInstrument(plan.voices.bass) : null;
			this.drums = plan.voices.drums ? await getDrumMachine() : null;
			if (gen !== this.playGen) return; // stopped/superseded while samples loaded

			// Adopt the plan's parameters only once this run is confirmed current:
			// the live Part callback reads quartersPerBar, so a superseded start()
			// must not shift the *playing* loop's trade-fours windows.
			this.quartersPerBar = plan.quartersPerBar;
			this._source = plan.source;

			const { events, totalTicks } = toScheduled(plan.events, plan.totalQuarters);
			this.teardownPart();
			// A new plan may highlight the other channel, or neither — clear both so
			// a chord slot can't stay lit underneath a drill.
			this.setActiveSlot(null);
			this.setActiveCue(null);

			if (events.length === 0 || totalTicks <= 0) {
				this.setState('stopped');
				return;
			}

			const transport = Tone.getTransport();
			transport.stop();
			transport.cancel();
			transport.position = 0;
			transport.bpm.value = plan.tempo;

			this.part = new Tone.Part<ScheduledEvent>((time, ev) => {
				// "Trade fours": the band drops out during your solo blocks. Chords and
				// bass go silent; drums + click keep time so you have a reference.
				const comping = isComping(ev.atQuarters, this.quartersPerBar, this.tradeBars);

				if (ev.kind === 'click') {
					this.ensureClick().triggerAttackRelease(
						ev.accent ? 'C6' : 'G5',
						0.03,
						time,
						ev.accent ? 0.9 : 0.5
					);
				} else if (ev.kind === 'drum') {
					const gain = this.mix.drums;
					if (this.drums && gain > 0) {
						const base = ev.accent ? DRUM_ACCENT_VELOCITY : DRUM_VELOCITY;
						this.drums.start({
							note: drumSampleName(ev.drum ?? 'kick'),
							time,
							velocity: Math.round(base * gain)
						});
					}
				} else {
					const isBass = ev.kind === 'bass';
					const isLead = ev.kind === 'lead';
					// Bass plays its own instrument when set; otherwise ('keys') the chord one.
					const inst = isBass ? (this.bassInstrument ?? this.instrument) : this.instrument;
					const gain = isBass ? this.mix.bass : isLead ? this.leadGain : this.mix.chords;
					// The lead is *your* line — trade-fours drops the band out, never it.
					if ((comping || isLead) && inst && gain > 0 && ev.midi.length) {
						// Seconds-per-quarter from the *current* tempo keeps durations live.
						const duration = (ev.durQuarters * 60) / Tone.getTransport().bpm.value;
						const base = isBass ? BASS_VELOCITY : isLead ? LEAD_VELOCITY : VELOCITY;
						const velocity = Math.round(base * gain);
						for (const note of ev.midi) inst.start({ note, time, duration, velocity });
					}
				}
				// Always advance the highlight, even when a lane is silenced, so you can
				// see the chord you're soloing over during your trade-fours turn.
				//
				// Draw callbacks queue ~lookAhead ahead of audio time and outlive
				// transport.cancel(), so both guards are load-bearing: `_state` covers a
				// stop just before a change, `gen` covers a *replacement* — without it a
				// stale draw from the previous run lights a slot mid-drill and it stays lit.
				if (ev.slotIndex !== null) {
					const slot = ev.slotIndex;
					Tone.getDraw().schedule(() => {
						if (this._state === 'playing' && gen === this.playGen) this.setActiveSlot(slot);
					}, time);
				}
				if (ev.cueIndex !== undefined) {
					const cue = ev.cueIndex;
					Tone.getDraw().schedule(() => {
						if (this._state === 'playing' && gen === this.playGen) this.setActiveCue(cue);
					}, time);
				}
			}, events);

			this.part.loop = true;
			this.part.loopStart = 0;
			this.part.loopEnd = `${totalTicks}i`;

			let loopStartTicks = 0;
			if (plan.countIn) {
				// One-bar metronome pre-roll (one-shot), then start the loop a bar in.
				const ppq = transport.PPQ || 192;
				const { beats, quartersPerBeat } = plan.countIn;
				const beatTicks = quartersPerBeat * ppq;
				for (let beat = 0; beat < beats; beat++) {
					transport.schedule((t) => {
						this.ensureClick().triggerAttackRelease(beat === 0 ? 'C6' : 'G5', 0.03, t, beat === 0 ? 0.9 : 0.6);
					}, `${Math.round(beat * beatTicks)}i`);
				}
				loopStartTicks = Math.round(beats * beatTicks);
				this.part.start(`${loopStartTicks}i`);
			} else {
				this.part.start(0);
			}

			// Fire onLoop listeners at each loop boundary (drives practice drills).
			if (this.loopListeners.size > 0) {
				this.loopEventId = transport.scheduleRepeat(
					() => {
						for (const fn of this.loopListeners) fn();
					},
					`${totalTicks}i`,
					`${loopStartTicks + totalTicks}i`
				);
			}

			transport.start();
			this.setState('playing');
		} catch (err) {
			// Only reset state if this run is still current — a stale rejection must
			// not clobber a newer play()'s 'loading'/'playing'.
			if (gen === this.playGen) this.setState('stopped');
			throw err;
		}
	}

	stop(): void {
		this.playGen++; // invalidate any in-flight play()
		const transport = Tone.getTransport();
		transport.stop();
		transport.cancel();
		transport.position = 0;
		this.teardownPart();
		this.instrument?.stop();
		this.setActiveSlot(null);
		this.setActiveCue(null);
		this.setState('stopped');
	}

	/** Live tempo change (no restart). */
	setTempo(bpm: number): void {
		Tone.getTransport().bpm.value = bpm;
	}

	private teardownPart(): void {
		if (this.loopEventId !== null) {
			Tone.getTransport().clear(this.loopEventId);
			this.loopEventId = null;
		}
		if (this.part) {
			this.part.stop();
			this.part.dispose();
			this.part = null;
		}
	}
}

/**
 * Place quarter-note positions on the transport as PPQ ticks. Ticks (not seconds)
 * keep tempo live and non-4/4 meters correct. Spreading the event keeps this in
 * step with CompEvent automatically — a new field never needs re-listing here.
 */
function toScheduled(
	events: CompEvent[],
	totalQuarters: number
): { events: ScheduledEvent[]; totalTicks: number } {
	const ppq = Tone.getTransport().PPQ || 192;
	return {
		events: events.map((e) => ({ ...e, time: `${Math.round(e.atQuarters * ppq)}i` })),
		totalTicks: Math.round(totalQuarters * ppq)
	};
}

/** Single shared engine (there is only one Tone Transport). */
export const engine = new PlaybackEngine();
