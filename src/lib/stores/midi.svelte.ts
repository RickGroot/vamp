// MIDI input state: connect a hardware keyboard and turn played chords into bars.

import { browser } from '$app/environment';
import { MidiInput } from '$lib/midi/input';
import { progression } from './progression.svelte';

export type MidiStatus = 'off' | 'requesting' | 'on' | 'error';

class MidiStore {
	status = $state<MidiStatus>('off');
	error = $state<string | null>(null);
	device = $state<string | null>(null);
	lastChord = $state<string | null>(null);

	private input = new MidiInput();

	get supported(): boolean {
		return browser && this.input.supported;
	}

	async enable(): Promise<void> {
		if (this.status === 'on' || this.status === 'requesting') return;
		this.status = 'requesting';
		this.error = null;
		const res = await this.input.enable((symbol) => {
			this.lastChord = symbol;
			progression.inputChord(symbol);
		});
		if (res.ok) {
			this.status = 'on';
			this.device = res.device ?? null;
		} else {
			this.status = 'error';
			this.error = res.error ?? 'Could not start MIDI.';
		}
	}

	disable(): void {
		this.input.disable();
		this.status = 'off';
		this.device = null;
	}
}

export const midi = new MidiStore();
