// The Learn workspace's player — the only owner of the 'learn' source on the
// shared engine. One run at a time: a lesson's listen step, a quiz question, the
// lab's A or B. Each run belongs to an `owner` (the card or question that
// started it), so only that control shows as playing.
//
// Engine rules it follows (see CLAUDE.md):
// - every engine callback checks `engine.source` before touching Learn state;
// - `play()` stops whatever is on the transport first, so a Sketch key-cycle
//   drill restores its key before the quiz starts;
// - `play()` reaches `engine.start()` synchronously — it must stay inside the
//   tap that called it, or iOS keeps the AudioContext suspended;
// - its own `loading` phase, because the engine announces 'loading' before it
//   switches `source`, so a source-guarded listener would never see it.
//
// Session-only: progress (what you've learned) is a separate, persisted store.

import { engine, type EngineState } from '$lib/audio/engine';
import type { LearnCue, LearnRun } from '$lib/learn/types';
import { droneState } from './drone.svelte';

/** idle → loading → playing → done (finished by itself) or idle (stopped). */
export type LearnPhase = 'idle' | 'loading' | 'playing' | 'done';

const LOAD_ERROR = "Couldn't load the sounds. Check your connection, then try again.";

class LearnStore {
	phase = $state<LearnPhase>('idle');
	/** Which card / question the current (or last) run belongs to. */
	owner = $state<string | null>(null);
	/** Index into `run.cues` of what is sounding now, or null. */
	cue = $state<number | null>(null);
	/** Raw: a run holds a whole plan's events, which must not be deep-proxied. */
	run = $state.raw<LearnRun | null>(null);
	error = $state<string | null>(null);

	/** What is sounding now — a field, not a getter: several components read it per cue. */
	cueInfo = $derived<LearnCue | null>(
		this.run && this.cue !== null ? (this.run.cues[this.cue] ?? null) : null
	);

	/** Set while play() stops the previous run, so that stop isn't read as ours ending. */
	private replacing = false;

	constructor() {
		engine.onState((state) => this.onEngineState(state));
		engine.onActiveCue((index) => {
			if (engine.source === 'learn') this.cue = index;
		});
	}

	/** Loading or sounding. */
	get isActive(): boolean {
		return this.phase === 'loading' || this.phase === 'playing';
	}

	/** Is this owner's run loading or sounding? */
	activeFor(owner: string): boolean {
		return this.isActive && this.owner === owner;
	}

	/**
	 * Play a run for an owner. Call it straight from the tap or key handler:
	 * nothing may be awaited before `engine.start()`.
	 */
	play(run: LearnRun, owner: string): Promise<void> {
		this.replacing = true;
		try {
			engine.stop(); // one transport: end a song, a drill or the previous question
		} finally {
			this.replacing = false;
		}
		// The Woodshed drone follows the SONG's key, which would fight the question's.
		droneState.off();
		this.run = run;
		this.owner = owner;
		this.cue = null;
		this.error = null;
		this.phase = 'loading';
		return engine.start(run.plan).catch(() => {
			if (this.run === run) {
				this.phase = 'idle';
				this.error = LOAD_ERROR;
			}
		});
	}

	/** Play the last run again ("Again" on a question). */
	replay(): void {
		if (this.run && this.owner) void this.play(this.run, this.owner);
	}

	stop(): void {
		if (this.isActive) engine.stop();
	}

	/**
	 * Forget this owner's run because what it would play has changed (a new key):
	 * stop it if it is sounding, and drop a finished one, so neither a replay nor
	 * "Play again" can sound the old version under the new chords.
	 */
	forget(owner: string): void {
		if (this.owner === owner) this.clear();
	}

	/** Leaving Learn: stop, and forget the run so the page reopens fresh. */
	leave(): void {
		this.clear();
	}

	private clear(): void {
		this.stop();
		this.phase = 'idle';
		this.owner = null;
		this.run = null;
		this.cue = null;
		this.error = null;
	}

	toggle(): void {
		if (this.isActive) this.stop();
		else this.replay();
	}

	private onEngineState(state: EngineState): void {
		if (this.replacing || !this.isActive) return;
		if (state === 'playing') {
			// Someone else took the transport (a song or a drill): this run is over.
			this.phase = engine.source === 'learn' ? 'playing' : 'idle';
			if (this.phase === 'idle') this.cue = null;
		} else if (state === 'stopped') {
			// `ended` tells a run that reached its end from one that was stopped.
			this.phase = engine.ended ? 'done' : 'idle';
			this.cue = null;
		}
		// 'loading' is ignored: phase is already 'loading', and the engine hasn't
		// switched its source yet.
	}
}

export const learn = new LearnStore();
