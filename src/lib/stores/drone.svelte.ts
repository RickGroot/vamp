// Drone control state: which pitch the pedal tone sounds, and its options.
// Preferences persist locally; the on/off state does not (audio can only start
// from a user gesture, so it always begins off).

import { browser } from '$app/environment';
import { Note } from 'tonal';
import { drone } from '$lib/audio/drone';

export const DRONE_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const DRONE_OCTAVES = [
	{ value: 2, label: 'Low' },
	{ value: 3, label: 'Mid' },
	{ value: 4, label: 'High' }
];

const PREFS_KEY = 'vamp:drone';
const FALLBACK_MIDI = 48; // C3

interface DronePrefs {
	root: string | null;
	octave: number;
	fifth: boolean;
	volume: number;
}

class DroneStore {
	on = $state(false);
	/** Chosen pitch class, or null to follow the progression's inferred key. */
	root = $state<string | null>(null);
	octave = $state(3);
	fifth = $state(true);
	volume = $state(0.5);

	constructor() {
		if (browser) {
			const p = readPrefs();
			if (p) {
				this.root = p.root;
				this.octave = p.octave;
				this.fifth = p.fifth;
				this.volume = p.volume;
			}
		}
	}

	private midiFor(fallbackRoot: string): number {
		const name = this.root ?? fallbackRoot;
		return Note.midi(`${name}${this.octave}`) ?? FALLBACK_MIDI;
	}

	private persist(): void {
		if (!browser) return;
		const prefs: DronePrefs = {
			root: this.root,
			octave: this.octave,
			fifth: this.fifth,
			volume: this.volume
		};
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	}

	async toggle(fallbackRoot: string): Promise<void> {
		if (this.on) {
			drone.stop();
			this.on = false;
		} else {
			await drone.start(this.midiFor(fallbackRoot), { fifth: this.fifth, volume: this.volume });
			this.on = true;
		}
	}

	setRoot(name: string | null, fallbackRoot: string): void {
		this.root = name;
		this.persist();
		if (this.on) drone.setRoot(this.midiFor(fallbackRoot));
	}

	setOctave(octave: number, fallbackRoot: string): void {
		this.octave = octave;
		this.persist();
		if (this.on) drone.setRoot(this.midiFor(fallbackRoot));
	}

	setFifth(on: boolean): void {
		this.fifth = on;
		this.persist();
		drone.setFifth(on);
	}

	setVolume(v: number): void {
		this.volume = Math.max(0, Math.min(1, v));
		this.persist();
		drone.setVolume(this.volume);
	}
}

function readPrefs(): DronePrefs | null {
	try {
		const raw = localStorage.getItem(PREFS_KEY);
		if (!raw) return null;
		const p = JSON.parse(raw) as Partial<DronePrefs>;
		return {
			root: typeof p.root === 'string' && DRONE_NOTES.includes(p.root) ? p.root : null,
			octave: DRONE_OCTAVES.some((o) => o.value === p.octave) ? (p.octave as number) : 3,
			fifth: p.fifth !== false,
			volume: typeof p.volume === 'number' ? Math.max(0, Math.min(1, p.volume)) : 0.5
		};
	} catch {
		return null;
	}
}

export const droneState = new DroneStore();
