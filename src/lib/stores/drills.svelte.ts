// Practice-drill settings (per-device prefs, persisted locally). The progression
// store reads these on each loop boundary to step the tempo / cycle the key; the
// engine reads clickFeel when building the metronome.

import { browser } from '$app/environment';
import type { ClickFeel, KeyCycleMode } from '$lib/audio/drills';

const KEY = 'vamp:drills';

export const CLICK_FEELS: { id: ClickFeel; label: string }[] = [
	{ id: 'all', label: 'Every beat' },
	{ id: 'backbeat', label: '2 & 4' },
	{ id: 'downbeat', label: 'Downbeat' }
];

export const KEY_MODES: { id: KeyCycleMode; label: string }[] = [
	{ id: 'off', label: 'Off' },
	{ id: 'fourths', label: 'Up a 4th' },
	{ id: 'semitone', label: 'Up a semitone' },
	{ id: 'random', label: 'Random' }
];

export const TEMPO_STEPS = [0, 2, 4, 8]; // BPM added per step (0 = off)
export const EVERY_OPTIONS = [1, 2, 4, 8]; // loops between steps/changes

interface DrillsPrefs {
	clickFeel: ClickFeel;
	tempoStep: number;
	tempoEvery: number;
	tempoMax: number;
	keyMode: KeyCycleMode;
	keyEvery: number;
}

const DEFAULTS: DrillsPrefs = {
	clickFeel: 'all',
	tempoStep: 0,
	tempoEvery: 2,
	tempoMax: 200,
	keyMode: 'off',
	keyEvery: 2
};

class DrillsStore {
	clickFeel = $state<ClickFeel>(DEFAULTS.clickFeel);
	tempoStep = $state(DEFAULTS.tempoStep);
	tempoEvery = $state(DEFAULTS.tempoEvery);
	tempoMax = $state(DEFAULTS.tempoMax);
	keyMode = $state<KeyCycleMode>(DEFAULTS.keyMode);
	keyEvery = $state(DEFAULTS.keyEvery);

	constructor() {
		if (browser) {
			const p = read();
			if (p) Object.assign(this, p);
		}
	}

	/** Whether any drill is engaged (so playback should snapshot for restore). */
	get cyclingKey(): boolean {
		return this.keyMode !== 'off';
	}
	get steppingTempo(): boolean {
		return this.tempoStep > 0;
	}

	private persist(): void {
		if (!browser) return;
		const prefs: DrillsPrefs = {
			clickFeel: this.clickFeel,
			tempoStep: this.tempoStep,
			tempoEvery: this.tempoEvery,
			tempoMax: this.tempoMax,
			keyMode: this.keyMode,
			keyEvery: this.keyEvery
		};
		localStorage.setItem(KEY, JSON.stringify(prefs));
	}

	setClickFeel(feel: ClickFeel): void {
		this.clickFeel = feel;
		this.persist();
	}
	setTempoStep(step: number): void {
		this.tempoStep = Math.max(0, step);
		this.persist();
	}
	setTempoEvery(loops: number): void {
		this.tempoEvery = Math.max(1, Math.floor(loops));
		this.persist();
	}
	setTempoMax(bpm: number): void {
		this.tempoMax = bpm;
		this.persist();
	}
	setKeyMode(mode: KeyCycleMode): void {
		this.keyMode = mode;
		this.persist();
	}
	setKeyEvery(loops: number): void {
		this.keyEvery = Math.max(1, Math.floor(loops));
		this.persist();
	}
}

function read(): DrillsPrefs | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const p = JSON.parse(raw) as Partial<DrillsPrefs>;
		const clickFeel: ClickFeel =
			p.clickFeel === 'backbeat' || p.clickFeel === 'downbeat' ? p.clickFeel : 'all';
		const keyMode: KeyCycleMode =
			p.keyMode === 'fourths' || p.keyMode === 'semitone' || p.keyMode === 'random'
				? p.keyMode
				: 'off';
		return {
			clickFeel,
			tempoStep: typeof p.tempoStep === 'number' ? Math.max(0, p.tempoStep) : DEFAULTS.tempoStep,
			tempoEvery: typeof p.tempoEvery === 'number' ? Math.max(1, p.tempoEvery) : DEFAULTS.tempoEvery,
			tempoMax: typeof p.tempoMax === 'number' ? p.tempoMax : DEFAULTS.tempoMax,
			keyMode,
			keyEvery: typeof p.keyEvery === 'number' ? Math.max(1, p.keyEvery) : DEFAULTS.keyEvery
		};
	} catch {
		return null;
	}
}

export const drills = new DrillsStore();
