// Editor state: the current progression, playback wiring, and an undo/redo
// history — as a Svelte 5 runes store. A single shared instance backs the editor.

import { engine, type EngineState } from '$lib/audio/engine';
import { barBeats } from '$lib/model/time';
import { createBar, createProgression, createSlot, TEMPO_MIN, TEMPO_MAX } from '$lib/model/factory';
import { buildPresetChords, type Preset } from '$lib/model/presets';
import { buildExample, type Example } from '$lib/model/examples';
import { randomProgression } from '$lib/model/inspire';
import { transposeChordSymbol } from '$lib/audio/transpose';
import { keyCycleInterval, nextStepTempo } from '$lib/audio/drills';
import { view } from './view.svelte';
import { drills } from './drills.svelte';
import type {
	BassInstrumentId,
	BassMode,
	CompPattern,
	DrumStyle,
	InstrumentId,
	Progression,
	Slot,
	TimeSignature
} from '$lib/model/types';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Canonical bounds live in the model layer (shared with import coercion).
export { TEMPO_MIN, TEMPO_MAX } from '$lib/model/factory';
/** How many chords a single bar may be split into (1 = full, 2 = half-bars, …). */
export const MAX_SLOTS_PER_BAR = 4;

const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

class ProgressionStore {
	current = $state<Progression>(createProgression());
	activeSlot = $state<number | null>(null);
	engineState = $state<EngineState>('stopped');

	private past = $state<Progression[]>([]);
	private future = $state<Progression[]>([]);
	private lastTag = '';
	private lastTagTime = 0;

	// Practice-drill session state (transient — never enters undo history).
	private drillOrigin: { chords: string[]; tempo: number } | null = null;
	/** Accumulated key-cycle transposition (semitones, mod 12) this drill session. */
	private drillSemis = 0;
	/** Last tempo the step-up drill set — restore only if still current on stop. */
	private lastDrillTempo: number | null = null;
	private tempoLoops = 0;
	private keyLoops = 0;

	constructor() {
		engine.onActiveSlot((i) => (this.activeSlot = i));
		engine.onState((s) => {
			this.engineState = s;
			if (s === 'stopped') this.endDrillSession();
		});
		engine.onLoop(() => this.onDrillLoop());
	}

	get isPlaying(): boolean {
		return this.engineState === 'playing';
	}

	get isLoading(): boolean {
		return this.engineState === 'loading';
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	/** Replace the edited progression (e.g. after load / new). Stops playback + clears history. */
	load(progression: Progression): void {
		// Unconditional: also invalidates an in-flight play() that hasn't flipped
		// the state to 'loading' yet (it awaits unlockAudio first) — otherwise the
		// just-replaced song could start playing over the newly loaded one.
		engine.stop();
		this.current = progression;
		this.past = [];
		this.future = [];
		this.lastTag = '';
	}

	newProgression(): void {
		this.load(createProgression());
	}

	/** Load a built-in example song (replaces the current progression). */
	loadExample(example: Example): void {
		this.load(buildExample(example));
	}

	// ---- history ----

	/**
	 * Snapshot the current state before a mutation. Rapid edits sharing a `tag`
	 * (e.g. typing in one chord slot) coalesce into a single undo step.
	 */
	private checkpoint(tag = ''): void {
		const now = Date.now();
		const coalesce = tag !== '' && tag === this.lastTag && now - this.lastTagTime < COALESCE_MS;
		this.lastTag = tag;
		this.lastTagTime = now;
		if (coalesce) return;
		this.past.push($state.snapshot(this.current));
		if (this.past.length > HISTORY_LIMIT) this.past.shift();
		this.future = [];
	}

	undo(): void {
		if (this.past.length === 0) return;
		// Finalize any active drill first: its transposed chords/tempo must not be
		// restored into (or captured against) an unrelated historical snapshot.
		this.endDrillSession();
		const wasPlaying = this.isPlaying;
		this.future.push($state.snapshot(this.current));
		this.current = this.past.pop()!;
		this.lastTag = '';
		engine.setTempo(this.current.tempo);
		if (wasPlaying) void this.play();
	}

	redo(): void {
		if (this.future.length === 0) return;
		this.endDrillSession();
		const wasPlaying = this.isPlaying;
		this.past.push($state.snapshot(this.current));
		this.current = this.future.pop()!;
		this.lastTag = '';
		engine.setTempo(this.current.tempo);
		if (wasPlaying) void this.play();
	}

	private touch(): void {
		this.current.updatedAt = Date.now();
	}

	// ---- metadata ----

	setName(name: string): void {
		this.checkpoint('name');
		this.current.name = name;
		this.touch();
	}

	setTempo(bpm: number): void {
		this.checkpoint('tempo');
		const tempo = clamp(Math.round(bpm) || TEMPO_MIN, TEMPO_MIN, TEMPO_MAX);
		this.current.tempo = tempo;
		this.touch();
		engine.setTempo(tempo); // live while playing
	}

	setInstrument(id: InstrumentId): void {
		this.checkpoint();
		this.current.instrument = id;
		this.touch();
		if (this.isPlaying) void this.play(); // restart so the new sound is heard
	}

	setTimeSignature(ts: TimeSignature): void {
		this.checkpoint();
		this.current.timeSignature = ts;
		// Keep each bar's slot count but redistribute its beats to fill the new bar.
		for (const bar of this.current.bars) {
			const each = barBeats(ts) / (bar.slots.length || 1);
			for (const slot of bar.slots) slot.beats = each;
		}
		this.touch();
		if (this.isPlaying) void this.play(); // rebuild the schedule in the new meter
	}

	// ---- groove ----

	setPattern(pattern: CompPattern): void {
		this.checkpoint('groove');
		this.current.groove.pattern = pattern;
		this.touch();
		if (this.isPlaying) void this.play();
	}

	setBassMode(mode: BassMode): void {
		if (this.current.groove.bass === mode) return;
		this.checkpoint('groove');
		this.current.groove.bass = mode;
		this.touch();
		if (this.isPlaying) void this.play();
	}

	setBassInstrument(id: BassInstrumentId): void {
		if (this.current.groove.bassInstrument === id) return;
		this.checkpoint('groove');
		this.current.groove.bassInstrument = id;
		this.touch();
		if (this.isPlaying) void this.play(); // reload + reroute the bass voice
	}

	toggleMetronome(): void {
		this.checkpoint('groove');
		this.current.groove.metronome = !this.current.groove.metronome;
		this.touch();
		if (this.isPlaying) void this.play();
	}

	setDrums(style: DrumStyle): void {
		this.checkpoint('groove');
		this.current.groove.drums = style;
		this.touch();
		if (this.isPlaying) void this.play();
	}

	// ---- transpose ----

	transpose(semitones: number): void {
		this.checkpoint();
		for (const bar of this.current.bars) {
			for (const slot of bar.slots) {
				if (slot.chord.trim()) slot.chord = transposeChordSymbol(slot.chord, semitones);
			}
		}
		this.touch();
		if (this.isPlaying) void this.play();
	}

	/** Replace the bars with a random diatonic progression. */
	inspire(): void {
		this.checkpoint();
		const { chords } = randomProgression();
		this.current.bars = chords.map((chord) => {
			const bar = createBar(this.current.timeSignature);
			bar.slots[0].chord = chord;
			return bar;
		});
		this.current.loopRange = null;
		this.touch();
		if (this.isPlaying) void this.play();
	}

	// ---- bars & slots ----

	addBar(): void {
		this.checkpoint();
		this.current.bars.push(createBar(this.current.timeSignature));
		this.touch();
	}

	/** Enter a chord (e.g. from MIDI): fill the first empty slot, else append a bar. */
	inputChord(chord: string): void {
		this.checkpoint();
		for (const bar of this.current.bars) {
			for (const slot of bar.slots) {
				if (!slot.chord.trim()) {
					slot.chord = chord;
					this.touch();
					return;
				}
			}
		}
		const bar = createBar(this.current.timeSignature);
		bar.slots[0].chord = chord;
		this.current.bars.push(bar);
		this.touch();
	}

	/** Append a bar pre-filled with a chord (used by next-chord suggestions). */
	appendChordBar(chord: string): void {
		this.checkpoint();
		const bar = createBar(this.current.timeSignature);
		bar.slots[0].chord = chord;
		this.current.bars.push(bar);
		this.touch();
	}

	removeBar(barIndex: number): void {
		if (this.current.bars.length <= 1) return;
		this.checkpoint();
		this.current.bars.splice(barIndex, 1);
		// Shift the loop range so it keeps covering the same bars, not the same
		// indices (deleting bar 1 must not slide a later loop onto other bars).
		const lr = this.current.loopRange;
		if (lr) {
			if (barIndex < lr.startBar) {
				this.current.loopRange = { startBar: lr.startBar - 1, endBar: lr.endBar - 1 };
			} else if (barIndex <= lr.endBar) {
				this.current.loopRange =
					lr.startBar === lr.endBar ? null : { startBar: lr.startBar, endBar: lr.endBar - 1 };
			}
		}
		this.clampLoopRange();
		this.touch();
		if (this.isPlaying) void this.play(); // drop the removed bar from the live schedule
	}

	/** Reorder a bar from one index to another (drag-and-drop). */
	moveBar(from: number, to: number): void {
		const n = this.current.bars.length;
		if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
		this.checkpoint();
		const [bar] = this.current.bars.splice(from, 1);
		this.current.bars.splice(to, 0, bar);
		// Remap the loop bounds through the move (remove-at-from + insert-at-to)
		// so the range follows the bars it covered.
		const lr = this.current.loopRange;
		if (lr) {
			const remap = (i: number): number => {
				if (i === from) return to;
				let j = i > from ? i - 1 : i;
				if (j >= to) j += 1;
				return j;
			};
			const a = remap(lr.startBar);
			const b = remap(lr.endBar);
			this.current.loopRange = { startBar: Math.min(a, b), endBar: Math.max(a, b) };
		}
		this.clampLoopRange();
		this.touch();
		if (this.isPlaying) void this.play(); // resync audio + playhead with the new order
	}

	/**
	 * Apply a preset progression (concert pitch). Replaces the bars when the canvas
	 * is empty, otherwise appends the preset's bars after the existing ones.
	 */
	applyPreset(preset: Preset, root: string): void {
		const chords = buildPresetChords(root, preset);
		if (chords.length === 0) return;
		this.checkpoint();

		const ts = this.current.timeSignature;
		const bars = chords.map((chord) => {
			const bar = createBar(ts);
			bar.slots[0].chord = chord;
			return bar;
		});

		const isEmpty = this.current.bars.every((bar) => bar.slots.every((s) => s.chord.trim() === ''));
		if (isEmpty) {
			this.current.bars = bars;
			this.current.loopRange = null;
			if (!this.current.name.trim() || this.current.name === 'Untitled progression') {
				this.current.name = `${preset.name} in ${root}`;
			}
		} else {
			this.current.bars.push(...bars);
		}
		this.clampLoopRange();
		this.touch();
		if (this.isPlaying) void this.play();
	}

	setSlotChord(barIndex: number, slotIndex: number, chord: string): void {
		const slot = this.current.bars[barIndex]?.slots[slotIndex];
		if (!slot) return;
		this.checkpoint(`slot:${barIndex}:${slotIndex}`);
		slot.chord = chord;
		this.touch();
	}

	/** Add a chord to a bar (full → half-bars → …), redistributing beats equally. */
	addSlot(barIndex: number): void {
		const bar = this.current.bars[barIndex];
		if (!bar || bar.slots.length >= MAX_SLOTS_PER_BAR) return;
		this.checkpoint();
		bar.slots.push(createSlot('', 0));
		this.redistribute(barIndex);
		this.touch();
		// Slot changes shift every later slot's global index — restart so the
		// audio and the playhead highlight stay in sync. (Appending a whole bar
		// is deliberately exempt: it preserves existing indices.)
		if (this.isPlaying) void this.play();
	}

	removeSlot(barIndex: number, slotIndex: number): void {
		const bar = this.current.bars[barIndex];
		if (!bar || bar.slots.length <= 1) return;
		this.checkpoint();
		bar.slots.splice(slotIndex, 1);
		this.redistribute(barIndex);
		this.touch();
		if (this.isPlaying) void this.play();
	}

	private redistribute(barIndex: number): void {
		const bar = this.current.bars[barIndex];
		if (!bar || bar.slots.length === 0) return;
		const each = barBeats(this.current.timeSignature) / bar.slots.length;
		for (const slot of bar.slots) slot.beats = each;
	}

	// ---- loop range ----

	/**
	 * Set the contiguous loop range by bar index. Selecting the whole progression
	 * clears the range (loops everything). Restarts playback so it takes effect.
	 */
	setLoopRange(startBar: number, endBar: number): void {
		this.checkpoint('loop');
		const n = this.current.bars.length;
		let start = clamp(startBar, 0, n - 1);
		let end = clamp(endBar, 0, n - 1);
		if (start > end) [start, end] = [end, start];
		this.current.loopRange = start === 0 && end === n - 1 ? null : { startBar: start, endBar: end };
		this.touch();
		if (this.isPlaying) void this.play();
	}

	clearLoopRange(): void {
		if (this.current.loopRange === null) return;
		this.checkpoint();
		this.current.loopRange = null;
		this.touch();
		if (this.isPlaying) void this.play();
	}

	/** Keep loopRange valid after bars change; collapse to null if it spans everything. */
	private clampLoopRange(): void {
		const lr = this.current.loopRange;
		if (!lr) return;
		const n = this.current.bars.length;
		const start = clamp(lr.startBar, 0, n - 1);
		const end = clamp(Math.max(lr.endBar, start), 0, n - 1);
		this.current.loopRange = start === 0 && end === n - 1 ? null : { startBar: start, endBar: end };
	}

	// ---- transport ----

	async play(): Promise<void> {
		try {
			await engine.play(this.current, { countIn: view.countIn, clickFeel: drills.clickFeel });
		} catch (err) {
			// Surface to the console; the UI falls back to 'stopped' via engine state.
			console.error('Vamp playback failed:', err);
		}
	}

	stop(): void {
		engine.stop();
	}

	// ---- practice drills (transient: tempo step-up + all-keys cycle) ----

	/** Fired by the engine at each loop boundary while playing. */
	private onDrillLoop(): void {
		if ((drills.steppingTempo || drills.cyclingKey) && !this.drillOrigin) {
			// Snapshot the original key + tempo before the drill changes anything.
			this.drillOrigin = { chords: this.captureChords(), tempo: this.current.tempo };
		}

		if (drills.steppingTempo && ++this.tempoLoops >= drills.tempoEvery) {
			this.tempoLoops = 0;
			// Only step UP toward a sane max — nextStepTempo is min(max, current+step),
			// so an unvalidated/low tempoMax must never drag a faster song down.
			const max = clamp(drills.tempoMax, TEMPO_MIN, TEMPO_MAX);
			if (this.current.tempo < max) {
				const next = nextStepTempo(this.current.tempo, drills.tempoStep, max);
				if (next !== this.current.tempo) {
					this.current.tempo = next;
					engine.setTempo(next);
					this.lastDrillTempo = next;
				}
			}
		}

		if (drills.cyclingKey && ++this.keyLoops >= drills.keyEvery) {
			this.keyLoops = 0;
			const semis = keyCycleInterval(drills.keyMode);
			// Defer out of the audio callback before rebuilding the loop in the new key.
			if (semis) setTimeout(() => this.cycleKey(semis), 0);
		}
	}

	/** Transpose to the next key and restart the loop — transient, no undo entry. */
	private cycleKey(semitones: number): void {
		if (!this.isPlaying) return;
		this.drillSemis = (((this.drillSemis + semitones) % 12) + 12) % 12;
		for (const bar of this.current.bars)
			for (const slot of bar.slots)
				if (slot.chord.trim()) slot.chord = transposeChordSymbol(slot.chord, semitones);
		void this.play();
	}

	/**
	 * Undo the drill's transient changes without clobbering the user's:
	 * - a slot still equal to its transposed original restores the original
	 *   spelling verbatim (no enharmonic drift);
	 * - a slot edited mid-drill is transposed back by the accumulated interval;
	 * - if the structure changed (bars/slots added/removed), everything is
	 *   transposed back positionlessly instead of written by stale position;
	 * - tempo restores only if the step-up drill was the last to set it.
	 */
	private endDrillSession(): void {
		this.tempoLoops = 0;
		this.keyLoops = 0;
		if (!this.drillOrigin) return;
		const { chords, tempo } = this.drillOrigin;
		const semis = this.drillSemis;
		const slots = this.flatSlots();

		if (slots.length === chords.length) {
			slots.forEach((slot, i) => {
				const expected =
					semis && chords[i].trim() ? transposeChordSymbol(chords[i], semis) : chords[i];
				if (slot.chord === expected) slot.chord = chords[i];
				else if (semis && slot.chord.trim())
					slot.chord = transposeChordSymbol(slot.chord, -semis);
			});
		} else if (semis) {
			for (const slot of slots)
				if (slot.chord.trim()) slot.chord = transposeChordSymbol(slot.chord, -semis);
		}

		if (this.lastDrillTempo !== null && this.current.tempo === this.lastDrillTempo) {
			this.current.tempo = tempo;
			engine.setTempo(tempo);
		}
		this.drillOrigin = null;
		this.drillSemis = 0;
		this.lastDrillTempo = null;
	}

	private captureChords(): string[] {
		return this.flatSlots().map((slot) => slot.chord);
	}

	private flatSlots(): Slot[] {
		const out: Slot[] = [];
		for (const bar of this.current.bars) for (const slot of bar.slots) out.push(slot);
		return out;
	}

	async toggle(): Promise<void> {
		if (this.isPlaying || this.isLoading) this.stop();
		else await this.play();
	}
}

export const progression = new ProgressionStore();
