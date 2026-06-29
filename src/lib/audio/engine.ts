// Playback engine: turn a Progression into a looping Tone.Transport schedule.
//
// Chords are voiced (voicing.ts) and expanded into rhythmic events by the groove
// (comp.ts), then scheduled in transport *ticks* (PPQ-based) so tempo stays live
// and non-4/4 meters work. Chords/bass play through the sampled instrument; the
// metronome uses a small Tone synth. The active-slot highlight is synced to audio
// time via Tone.getDraw().

import * as Tone from 'tone';
import type { Progression } from '$lib/model/types';
import { barBeats, beatsToQuarters } from '$lib/model/time';
import { buildScheduledEvents } from './schedule';
import { type CompKind } from './comp';
import { isComping, type MixLevels } from './mix';
import { type ClickFeel } from './drills';
import {
	getInstrument,
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

interface ScheduledEvent {
	time: string; // transport ticks, e.g. "384i"
	/** Start position in quarter notes from the loop start (for trade-fours windows). */
	atQuarters: number;
	durQuarters: number;
	midi: number[];
	kind: CompKind;
	slotIndex: number | null;
	accent?: boolean;
	drum?: string;
}

type StateListener = (state: EngineState) => void;
type SlotListener = (index: number | null) => void;
type LoopListener = () => void;

class PlaybackEngine {
	private part: Tone.Part | null = null;
	private instrument: LoadedInstrument | null = null;
	private drums: LoadedDrums | null = null;
	private click: Tone.Synth | null = null;
	private _state: EngineState = 'stopped';
	private loopEventId: number | null = null;
	private readonly stateListeners = new Set<StateListener>();
	private readonly slotListeners = new Set<SlotListener>();
	private readonly loopListeners = new Set<LoopListener>();

	// Practice mix, read live by the Part callback so changes apply without a restart.
	private mix: MixLevels = { chords: 1, bass: 1, drums: 1 };
	private tradeBars = 0;
	private quartersPerBar = 4;

	get state(): EngineState {
		return this._state;
	}

	/** Set per-lane playback gains (0..1). Applies live while playing. */
	setMix(mix: MixLevels): void {
		this.mix = mix;
	}

	/** "Trade fours" block length in bars (0 = off). Applies live while playing. */
	setTradeBars(bars: number): void {
		this.tradeBars = Math.max(0, Math.floor(bars));
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
		await unlockAudio();
		this.setState('loading');
		try {
			this.quartersPerBar = beatsToQuarters(barBeats(progression.timeSignature), progression.timeSignature);
			this.instrument = await getInstrument(progression.instrument);
			this.drums = progression.groove.drums !== 'none' ? await getDrumMachine() : null;

			const { events, totalTicks } = buildEvents(progression, opts.clickFeel);
			this.teardownPart();

			if (events.length === 0 || totalTicks <= 0) {
				this.setState('stopped');
				return;
			}

			const transport = Tone.getTransport();
			transport.stop();
			transport.cancel();
			transport.position = 0;
			transport.bpm.value = progression.tempo;

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
					const inst = this.instrument;
					const gain = ev.kind === 'bass' ? this.mix.bass : this.mix.chords;
					if (comping && inst && gain > 0 && ev.midi.length) {
						// Seconds-per-quarter from the *current* tempo keeps durations live.
						const duration = (ev.durQuarters * 60) / Tone.getTransport().bpm.value;
						const base = ev.kind === 'bass' ? BASS_VELOCITY : VELOCITY;
						const velocity = Math.round(base * gain);
						for (const note of ev.midi) inst.start({ note, time, duration, velocity });
					}
				}
				// Always advance the highlight, even when a lane is silenced, so you can
				// see the chord you're soloing over during your trade-fours turn.
				if (ev.slotIndex !== null) {
					const slot = ev.slotIndex;
					Tone.getDraw().schedule(() => this.setActiveSlot(slot), time);
				}
			}, events);

			this.part.loop = true;
			this.part.loopStart = 0;
			this.part.loopEnd = `${totalTicks}i`;

			let loopStartTicks = 0;
			if (opts.countIn) {
				// One-bar metronome pre-roll (one-shot), then start the loop a bar in.
				const ppq = transport.PPQ || 192;
				const ts = progression.timeSignature;
				const beatTicks = (4 / ts.denominator) * ppq;
				for (let beat = 0; beat < ts.numerator; beat++) {
					transport.schedule((t) => {
						this.ensureClick().triggerAttackRelease(beat === 0 ? 'C6' : 'G5', 0.03, t, beat === 0 ? 0.9 : 0.6);
					}, `${Math.round(beat * beatTicks)}i`);
				}
				loopStartTicks = Math.round(ts.numerator * beatTicks);
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
			this.setState('stopped');
			throw err;
		}
	}

	stop(): void {
		const transport = Tone.getTransport();
		transport.stop();
		transport.cancel();
		transport.position = 0;
		this.teardownPart();
		this.instrument?.stop();
		this.setActiveSlot(null);
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

function buildEvents(
	progression: Progression,
	clickFeel?: ClickFeel
): { events: ScheduledEvent[]; totalTicks: number } {
	const ppq = Tone.getTransport().PPQ || 192;
	const { events, totalQuarters } = buildScheduledEvents(progression, { clickFeel });
	const scheduled: ScheduledEvent[] = events.map((e) => ({
		time: `${Math.round(e.atQuarters * ppq)}i`,
		atQuarters: e.atQuarters,
		durQuarters: e.durQuarters,
		midi: e.midi,
		kind: e.kind,
		slotIndex: e.slotIndex,
		accent: e.accent,
		drum: e.drum
	}));
	return { events: scheduled, totalTicks: Math.round(totalQuarters * ppq) };
}

/** Single shared engine (there is only one Tone Transport). */
export const engine = new PlaybackEngine();
