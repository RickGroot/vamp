// Web MIDI chord input — play chords on a hardware keyboard to enter them.
//
// We watch note-on/off across all inputs, capture the peak set of notes held
// together in one gesture, and identify the chord with tonal when you release.
// Web MIDI is Chromium-only and needs a user permission grant; everything here
// is local (no network).

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

export interface MidiStartResult {
	ok: boolean;
	error?: string;
	device?: string;
}

export class MidiInput {
	private access: MIDIAccess | null = null;
	private held = new Set<number>();
	private peak = new Set<number>();
	private onChord: (symbol: string) => void = () => {};
	private readonly handler = (e: MIDIMessageEvent) => this.handle(e);

	get supported(): boolean {
		return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
	}

	async enable(onChord: (symbol: string) => void): Promise<MidiStartResult> {
		if (!this.supported) return { ok: false, error: "This browser doesn't support Web MIDI." };
		this.onChord = onChord;
		try {
			this.access = await navigator.requestMIDIAccess({ sysex: false });
		} catch (e) {
			return { ok: false, error: (e as Error)?.message || 'MIDI access was denied.' };
		}
		this.attach();
		this.access.onstatechange = () => this.attach();
		const names = [...this.access.inputs.values()].map((i) => i.name).filter(Boolean);
		return { ok: true, device: (names[0] as string) || undefined };
	}

	private attach(): void {
		if (!this.access) return;
		for (const input of this.access.inputs.values()) input.onmidimessage = this.handler;
	}

	private handle(e: MIDIMessageEvent): void {
		if (!e.data) return;
		const [status, note, velocity] = e.data;
		const type = status & 0xf0;
		if (type === 0x90 && velocity > 0) {
			if (this.held.size === 0) this.peak.clear();
			this.held.add(note);
			this.peak.add(note);
		} else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
			this.held.delete(note);
			if (this.held.size === 0 && this.peak.size > 0) {
				const symbol = detectChordSymbol([...this.peak]);
				this.peak.clear();
				if (symbol) this.onChord(symbol);
			}
		}
	}

	disable(): void {
		if (this.access) {
			for (const input of this.access.inputs.values()) input.onmidimessage = null;
			this.access.onstatechange = null;
		}
		this.access = null;
		this.held.clear();
		this.peak.clear();
	}
}
