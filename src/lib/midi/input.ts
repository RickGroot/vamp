// Web MIDI chord input — play chords on a hardware keyboard to enter them.
//
// We watch note-on/off across all inputs, capture the peak set of notes held
// together in one gesture, and identify the chord with tonal when you release.
// Web MIDI is Chromium-only and needs a user permission grant; everything here
// is local (no network).
//
// The gesture itself is `ChordGesture`: pure (no Web MIDI), so it is tested.
// `MidiInput` only owns the access, the ports and the disconnect reset.

import { Chord, Note } from 'tonal';

/** Identify a chord symbol from a set of MIDI note numbers (null if none). */
export function detectChordSymbol(midi: number[]): string | null {
	const uniq = [...new Set(midi)].sort((a, b) => a - b);
	if (uniq.length < 2) return null;
	const names = uniq.map((m) => Note.fromMidi(m)).filter(Boolean) as string[];
	const found = Chord.detect(names, { assumePerfectFifth: true });
	if (!found.length) return null;
	return normalizeChordName(found[0]);
}

/** tonal returns e.g. "CM" / "CM7" — tidy to the symbols the app uses ("C" / "Cmaj7"). */
function normalizeChordName(name: string): string {
	const [main, bass] = name.split('/');
	const tidy = main
		.replace(/M(?=(6|7|9|11|13))/, 'maj') // CM7 -> Cmaj7
		.replace(/^([A-G][#b]?)M$/, '$1'); // CM -> C
	return bass ? `${tidy}/${bass}` : tidy;
}

/** One gesture on the keyboard: the notes held together, reported on full release. */
export interface MidiGesture {
	/** The peak set of MIDI notes held at once, ascending, no duplicates. */
	notes: number[];
	/** `detectChordSymbol` of those notes (null for one note, or nothing tonal names). */
	symbol: string | null;
}

/**
 * Note-on/off in, a gesture out. A gesture starts with the first key down and
 * ends when the LAST key is up; every note pressed in between joins it, so
 * re-pressing a key (or adding one) before letting go of all of them extends the
 * same chord. A note-on with velocity 0 is a note-off (running status). Pure.
 */
export class ChordGesture {
	private held = new Set<number>();
	private peak = new Set<number>();

	/** A raw MIDI message (any channel). Returns the finished gesture, or null. */
	message(data: ArrayLike<number>): MidiGesture | null {
		if (data.length < 3) return null;
		const type = data[0] & 0xf0;
		const note = data[1];
		const velocity = data[2];
		if (type === 0x90 && velocity > 0) {
			this.noteOn(note);
			return null;
		}
		if (type === 0x80 || type === 0x90) return this.noteOff(note);
		return null;
	}

	noteOn(note: number): void {
		if (this.held.size === 0) this.peak.clear();
		this.held.add(note);
		this.peak.add(note);
	}

	noteOff(note: number): MidiGesture | null {
		this.held.delete(note);
		if (this.held.size > 0 || this.peak.size === 0) return null;
		const notes = [...this.peak].sort((a, b) => a - b);
		this.peak.clear();
		return { notes, symbol: detectChordSymbol(notes) };
	}

	/**
	 * Forget the gesture in progress. A device unplugged while notes are held
	 * never sends its note-offs, so `held` would stay non-empty forever and no
	 * gesture could ever complete again.
	 */
	reset(): void {
		this.held.clear();
		this.peak.clear();
	}
}

export interface MidiStartResult {
	ok: boolean;
	error?: string;
	device?: string;
}

export class MidiInput {
	private access: MIDIAccess | null = null;
	private gesture = new ChordGesture();
	private onGesture: (gesture: MidiGesture) => void = () => {};
	private readonly handler = (e: MIDIMessageEvent) => this.handle(e);

	get supported(): boolean {
		return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
	}

	/** Every finished gesture goes to `onGesture`, chord or not: the caller decides. */
	async enable(onGesture: (gesture: MidiGesture) => void): Promise<MidiStartResult> {
		if (!this.supported) return { ok: false, error: "This browser doesn't support Web MIDI." };
		this.onGesture = onGesture;
		try {
			this.access = await navigator.requestMIDIAccess({ sysex: false });
		} catch (e) {
			return { ok: false, error: (e as Error)?.message || 'MIDI access was denied.' };
		}
		this.attach();
		this.access.onstatechange = (e) => {
			// Reset the gesture on any input disconnect (see ChordGesture.reset).
			const port = (e as MIDIConnectionEvent).port;
			if (port?.type === 'input' && port.state === 'disconnected') this.gesture.reset();
			this.attach();
		};
		const names = [...this.access.inputs.values()].map((i) => i.name).filter(Boolean);
		return { ok: true, device: (names[0] as string) || undefined };
	}

	// The handler is ASSIGNED, never added: re-attaching on every state change
	// (a device plugged in) can't double it, and the last assignment wins.
	private attach(): void {
		if (!this.access) return;
		for (const input of this.access.inputs.values()) input.onmidimessage = this.handler;
	}

	private handle(e: MIDIMessageEvent): void {
		if (!e.data) return;
		const done = this.gesture.message(e.data);
		if (done) this.onGesture(done);
	}

	disable(): void {
		if (this.access) {
			for (const input of this.access.inputs.values()) input.onmidimessage = null;
			this.access.onstatechange = null;
		}
		this.access = null;
		this.gesture.reset();
	}
}
