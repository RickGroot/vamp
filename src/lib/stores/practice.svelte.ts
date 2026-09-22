// Practice-mode state: which drill, how it runs, and the transport wiring.
//
// This store owns the drill side of the SHARED engine. Two rules keep it from
// colliding with the editor:
//   - it subscribes to engine.onActiveCue, never onActiveSlot (that channel is
//     the song's flattenSlots global index);
//   - it calls engine.stop() before starting, which lets the progression store
//     finalise any transient song drill and restore the user's key first.
//
// Engine sync happens in setters, not $effects (the view.syncMix convention).

import { browser } from '$app/environment';
import { engine, type EngineState } from '$lib/audio/engine';
import { TEMPO_MAX, TEMPO_MIN } from '$lib/model/factory';
import type { ClickFeel, KeyCycleMode } from '$lib/audio/drills';
import { nextStepTempo } from '$lib/audio/drills';
import type { DrumStyle, InstrumentId } from '$lib/model/types';
import { BUILT_IN_DRILLS, drillById } from '$lib/practice/patterns';
import { drillPlan, type DrillBacking } from '$lib/practice/plan';
import { rangeFor, DEFAULT_RANGE_ID, INSTRUMENT_RANGES } from '$lib/practice/range';
import { resolveDrill } from '$lib/practice/resolve';
import type { DrillDirection, DrillRun, Register } from '$lib/practice/types';

const KEY = 'vamp:practice';

export const REP_OPTIONS = [1, 2, 4, 6, 12];
export const REST_OPTIONS = [0, 1, 2, 4];
export const REGISTERS: { id: Register; label: string }[] = [
	{ id: 'low', label: 'Low' },
	{ id: 'middle', label: 'Middle' },
	{ id: 'high', label: 'High' }
];
export const DIRECTIONS: { id: DrillDirection; label: string }[] = [
	{ id: 'up', label: 'Up' },
	{ id: 'down', label: 'Down' },
	{ id: 'updown', label: 'Up & down' },
	{ id: 'downup', label: 'Down & up' }
];
export const BACKINGS: { id: DrillBacking; label: string }[] = [
	{ id: 'click', label: 'Click' },
	{ id: 'drums', label: 'Drums' },
	{ id: 'none', label: 'Nothing' }
];

interface PracticePrefs {
	drillId: string;
	root: string;
	keyMode: KeyCycleMode;
	reps: number;
	rangeId: string;
	register: Register;
	direction: DrillDirection | '';
	tempo: number;
	tempoStep: number;
	tempoMax: number;
	restBars: number;
	backing: DrillBacking;
	clickFeel: ClickFeel;
	drumStyle: DrumStyle;
	instrument: InstrumentId;
	countIn: boolean;
	leadAudible: boolean;
}

const DEFAULTS: PracticePrefs = {
	drillId: 'scale-1235',
	root: 'C',
	keyMode: 'fourths',
	reps: 4,
	rangeId: DEFAULT_RANGE_ID,
	register: 'middle',
	direction: '',
	tempo: 90,
	tempoStep: 0,
	tempoMax: 160,
	restBars: 1,
	backing: 'click',
	clickFeel: 'all',
	drumStyle: 'swing',
	instrument: 'piano',
	countIn: true,
	leadAudible: true
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

class PracticeStore {
	drillId = $state(DEFAULTS.drillId);
	root = $state(DEFAULTS.root);
	keyMode = $state<KeyCycleMode>(DEFAULTS.keyMode);
	reps = $state(DEFAULTS.reps);
	rangeId = $state(DEFAULTS.rangeId);
	register = $state<Register>(DEFAULTS.register);
	direction = $state<DrillDirection | ''>(DEFAULTS.direction);
	tempo = $state(DEFAULTS.tempo);
	tempoStep = $state(DEFAULTS.tempoStep);
	tempoMax = $state(DEFAULTS.tempoMax);
	restBars = $state(DEFAULTS.restBars);
	backing = $state<DrillBacking>(DEFAULTS.backing);
	clickFeel = $state<ClickFeel>(DEFAULTS.clickFeel);
	drumStyle = $state<DrumStyle>(DEFAULTS.drumStyle);
	instrument = $state<InstrumentId>(DEFAULTS.instrument);
	countIn = $state(DEFAULTS.countIn);
	/** Hear the line, or play it yourself over the backing. */
	leadAudible = $state(DEFAULTS.leadAudible);

	/** Instrument pitch offset, pushed in from the view store (see below). */
	offset = $state(0);

	engineState = $state<EngineState>('stopped');
	/** Index of the sounding drill note, or null. Driven by engine.onActiveCue. */
	cue = $state<number | null>(null);

	/** The run that is actually on the transport — frozen at start. */
	private playing: DrillRun | null = null;
	private lastRep = -1;

	constructor() {
		if (browser) {
			const saved = read();
			if (saved) Object.assign(this, saved);
		}
		engine.onState((s) => {
			// Only track the engine while a drill owns it; a song playing on the
			// other route must not light up this UI.
			if (engine.source !== 'drill') {
				if (this.engineState !== 'stopped') this.engineState = 'stopped';
				return;
			}
			this.engineState = s;
			if (s === 'stopped') {
				this.cue = null;
				this.playing = null;
				this.lastRep = -1;
			}
		});
		engine.onActiveCue((i) => this.onCue(i));
	}

	get definition() {
		return drillById(this.drillId) ?? BUILT_IN_DRILLS[0];
	}

	get range() {
		return rangeFor(this.rangeId);
	}

	get rangeLabel(): string {
		return INSTRUMENT_RANGES.find((r) => r.id === this.rangeId)?.label ?? this.rangeId;
	}

	get isPlaying(): boolean {
		return this.engineState === 'playing';
	}

	get isLoading(): boolean {
		return this.engineState === 'loading';
	}

	/**
	 * The resolved run for the CURRENT settings — recomputed on every change so
	 * the notation previews what pressing Start will play. While playing, the
	 * frozen run is authoritative, so edits can't desync the notation from audio.
	 */
	get run(): DrillRun {
		if (this.playing) return this.playing;
		return this.preview;
	}

	get preview(): DrillRun {
		return resolveDrill(this.definition, {
			root: this.root,
			keyMode: this.keyMode,
			reps: this.reps,
			offset: this.offset,
			range: this.range,
			register: this.register,
			direction: this.direction || undefined,
			tempo: this.tempo,
			tempoStep: this.tempoStep,
			tempoMax: this.tempoMax,
			restBars: this.restBars
		});
	}

	/** Which repetition is sounding (0-based), or null when stopped. */
	get rep(): number | null {
		if (this.cue === null) return null;
		return this.run.notes[this.cue]?.rep ?? null;
	}

	get currentNote() {
		return this.cue === null ? null : (this.run.notes[this.cue] ?? null);
	}

	get currentPhrase() {
		const rep = this.rep;
		return rep === null ? null : (this.run.phrases.find((p) => p.rep === rep) ?? null);
	}

	/**
	 * Step the tempo when the repetition changes. Live — `setTempo` just sets
	 * bpm.value, and note durations are derived from the current bpm inside the
	 * Part callback, so the whole pre-generated plan follows without a restart.
	 */
	private onCue(index: number | null): void {
		if (engine.source !== 'drill') return;
		this.cue = index;
		if (index === null) return;
		const run = this.playing;
		if (!run) return;
		const rep = run.notes[index]?.rep;
		if (rep === undefined || rep === this.lastRep) return;
		this.lastRep = rep;
		const phrase = run.phrases.find((p) => p.rep === rep);
		if (phrase) engine.setTempo(phrase.tempo);
	}

	async start(): Promise<void> {
		// Hand the transport over cleanly: this fires 'stopped', which lets the
		// progression store finalise any transient song drill and restore the
		// user's original key and tempo before we take over.
		engine.stop();
		const run = this.preview;
		if (run.notes.length === 0) return;
		this.playing = run;
		this.lastRep = -1;
		engine.setLeadGain(this.leadAudible ? 1 : 0);
		try {
			await engine.start(
				drillPlan(run, {
					backing: this.backing,
					clickFeel: this.clickFeel,
					drumStyle: this.drumStyle,
					instrument: this.instrument,
					countIn: this.countIn
				})
			);
		} catch (err) {
			console.error('Vamp drill playback failed:', err);
			this.playing = null;
		}
	}

	stop(): void {
		// Only ours to stop. (The Practice route stops on unmount, so in practice
		// a song is never playing here — but the engine is shared, so check.)
		if (engine.source === 'drill') engine.stop();
		this.playing = null;
		this.cue = null;
		this.lastRep = -1;
	}

	async toggle(): Promise<void> {
		if (this.isPlaying || this.isLoading) this.stop();
		else await this.start();
	}

	/** Restart so a schedule-changing setting takes effect, if one is running. */
	private restartIfPlaying(): void {
		if (this.isPlaying) void this.start();
	}

	// ---- setters (persist; engine sync happens here, not in effects) ----

	setOffset(offset: number): void {
		if (this.offset === offset) return;
		this.offset = offset;
		// Written pitch changed, so the notes themselves change.
		this.restartIfPlaying();
	}

	setDrill(id: string): void {
		this.drillId = id;
		this.persist();
		this.restartIfPlaying();
	}
	setRoot(root: string): void {
		this.root = root;
		this.persist();
		this.restartIfPlaying();
	}
	setKeyMode(mode: KeyCycleMode): void {
		this.keyMode = mode;
		this.persist();
		this.restartIfPlaying();
	}
	setReps(reps: number): void {
		this.reps = Math.max(1, Math.floor(reps));
		this.persist();
		this.restartIfPlaying();
	}
	setRangeId(id: string): void {
		this.rangeId = id;
		this.persist();
		this.restartIfPlaying();
	}
	setRegister(register: Register): void {
		this.register = register;
		this.persist();
		this.restartIfPlaying();
	}
	setDirection(direction: DrillDirection | ''): void {
		this.direction = direction;
		this.persist();
		this.restartIfPlaying();
	}
	setTempo(bpm: number): void {
		this.tempo = clamp(Math.round(bpm) || TEMPO_MIN, TEMPO_MIN, TEMPO_MAX);
		this.persist();
		// Live — no restart, exactly like the song's tempo.
		if (this.isPlaying) engine.setTempo(this.tempo);
	}
	setTempoStep(step: number): void {
		this.tempoStep = Math.max(0, step);
		this.persist();
	}
	setTempoMax(bpm: number): void {
		this.tempoMax = clamp(Math.round(bpm) || DEFAULTS.tempoMax, TEMPO_MIN, TEMPO_MAX);
		this.persist();
	}
	setRestBars(bars: number): void {
		this.restBars = Math.max(0, Math.floor(bars));
		this.persist();
		this.restartIfPlaying();
	}
	setBacking(backing: DrillBacking): void {
		this.backing = backing;
		this.persist();
		this.restartIfPlaying();
	}
	setClickFeel(feel: ClickFeel): void {
		this.clickFeel = feel;
		this.persist();
		this.restartIfPlaying();
	}
	setDrumStyle(style: DrumStyle): void {
		this.drumStyle = style;
		this.persist();
		this.restartIfPlaying();
	}
	setInstrument(id: InstrumentId): void {
		this.instrument = id;
		this.persist();
		this.restartIfPlaying();
	}
	setCountIn(on: boolean): void {
		this.countIn = on;
		this.persist();
	}
	/** Live: flips listen<->play with no restart and no lost position. */
	setLeadAudible(on: boolean): void {
		this.leadAudible = on;
		engine.setLeadGain(on ? 1 : 0);
		this.persist();
	}

	private persist(): void {
		if (!browser) return;
		const prefs: PracticePrefs = {
			drillId: this.drillId,
			root: this.root,
			keyMode: this.keyMode,
			reps: this.reps,
			rangeId: this.rangeId,
			register: this.register,
			direction: this.direction,
			tempo: this.tempo,
			tempoStep: this.tempoStep,
			tempoMax: this.tempoMax,
			restBars: this.restBars,
			backing: this.backing,
			clickFeel: this.clickFeel,
			drumStyle: this.drumStyle,
			instrument: this.instrument,
			countIn: this.countIn,
			leadAudible: this.leadAudible
		};
		try {
			localStorage.setItem(KEY, JSON.stringify(prefs));
		} catch {
			/* storage unavailable (private mode / quota) — prefs are not critical */
		}
	}
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.includes(value as T) ? (value as T) : fallback;

/** Defensive read: a hand-edited or stale record must never break the page. */
function read(): PracticePrefs | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const p = JSON.parse(raw) as Partial<PracticePrefs>;
		const num = (v: unknown, fallback: number, min: number, max = Infinity) =>
			typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
		return {
			drillId: drillById(String(p.drillId)) ? String(p.drillId) : DEFAULTS.drillId,
			root: typeof p.root === 'string' && p.root ? p.root : DEFAULTS.root,
			keyMode: oneOf(p.keyMode, ['off', 'fourths', 'semitone', 'random'], DEFAULTS.keyMode),
			reps: num(p.reps, DEFAULTS.reps, 1, 64),
			rangeId: INSTRUMENT_RANGES.some((r) => r.id === p.rangeId)
				? (p.rangeId as string)
				: DEFAULTS.rangeId,
			register: oneOf(p.register, ['low', 'middle', 'high'], DEFAULTS.register),
			direction: oneOf(p.direction, ['', 'up', 'down', 'updown', 'downup'], DEFAULTS.direction),
			tempo: num(p.tempo, DEFAULTS.tempo, TEMPO_MIN, TEMPO_MAX),
			tempoStep: num(p.tempoStep, DEFAULTS.tempoStep, 0, 32),
			tempoMax: num(p.tempoMax, DEFAULTS.tempoMax, TEMPO_MIN, TEMPO_MAX),
			restBars: num(p.restBars, DEFAULTS.restBars, 0, 16),
			backing: oneOf(p.backing, ['none', 'click', 'drums'], DEFAULTS.backing),
			clickFeel: oneOf(p.clickFeel, ['all', 'backbeat', 'downbeat'], DEFAULTS.clickFeel),
			drumStyle: oneOf(p.drumStyle, ['none', 'rock', 'pop', 'swing', 'bossa'], DEFAULTS.drumStyle),
			instrument: oneOf(p.instrument, ['piano', 'guitar', 'rhodes', 'pad'], DEFAULTS.instrument),
			countIn: typeof p.countIn === 'boolean' ? p.countIn : DEFAULTS.countIn,
			leadAudible: typeof p.leadAudible === 'boolean' ? p.leadAudible : DEFAULTS.leadAudible
		};
	} catch {
		return null;
	}
}

export { nextStepTempo };
export const practice = new PracticeStore();
