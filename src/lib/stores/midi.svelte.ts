// MIDI input state: connect a hardware keyboard and turn played chords into bars —
// or, while something has CAPTURED the keyboard (an Ear question), into that
// thing's answer instead.
//
// There is ONE MidiInput, owned here: Sketch and Learn share the connection, and
// only where its gestures go changes. A capture never touches the song, so a
// quiz answer can't edit it or leave an undo step.

import { browser } from '$app/environment';
import { MidiInput, gestureTarget, type MidiGesture } from '$lib/midi/input';
import { progression } from './progression.svelte';

export type MidiStatus = 'off' | 'requesting' | 'on' | 'error';

/** Takes every finished gesture while it holds the keyboard (chord or not). */
export type MidiCapture = (gesture: MidiGesture) => void;

/** Takes every note-on as it happens (not on release), with its timestamp, while it holds the keyboard. */
export type NoteCapture = (note: number, atMs: number) => void;

class MidiStore {
	status = $state<MidiStatus>('off');
	error = $state<string | null>(null);
	device = $state<string | null>(null);
	lastChord = $state<string | null>(null);

	private input = new MidiInput();
	/** Wrapped, so a release compares by capture, not by function: capturing the
	 *  same fn twice still gives two captures, and the first release can't drop
	 *  the second. */
	private captor: { fn: MidiCapture } | null = null;
	/** Same token rule as captor. A plain field: nothing renders from it. */
	private noter: { fn: NoteCapture } | null = null;

	get supported(): boolean {
		return browser && this.input.supported;
	}

	async enable(): Promise<void> {
		if (this.status === 'on' || this.status === 'requesting') return;
		this.status = 'requesting';
		this.error = null;
		const res = await this.input.enable(
			(gesture) => this.route(gesture),
			(note, at) => this.noter?.fn(note, at)
		);
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

	/**
	 * Take the keyboard's gestures until the returned release is called. The
	 * latest capture wins; its release clears only if it still holds THIS
	 * capture, so a card released after another took over can't cut that one off.
	 * Drive answers from here, never from an $effect on `lastChord`: the same
	 * chord played twice doesn't change it.
	 */
	capture(fn: MidiCapture): () => void {
		const mine = { fn };
		this.captor = mine;
		return () => {
			if (this.captor === mine) this.captor = null;
		};
	}

	/**
	 * Take the keyboard's NOTES until the returned release is called, and with
	 * them its chords: while held, no gesture reaches the song or a chord
	 * capture, so playing a lick back can never write a bar.
	 */
	captureNotes(fn: NoteCapture): () => void {
		const mine = { fn };
		this.noter = mine;
		return () => {
			if (this.noter === mine) this.noter = null;
		};
	}

	private route(gesture: MidiGesture): void {
		// A note capture suppresses lastChord too: nothing may react to a lick.
		if (this.noter === null && gesture.symbol) this.lastChord = gesture.symbol;
		const target = gestureTarget({ noter: this.noter !== null, captor: this.captor !== null }, gesture);
		if (target === 'swallow' || target === 'ignore') return;
		if (target === 'captor') {
			this.captor!.fn(gesture);
			return;
		}
		progression.inputChord(gesture.symbol!); // 'song' only for a gesture with a symbol
	}
}

export const midi = new MidiStore();
