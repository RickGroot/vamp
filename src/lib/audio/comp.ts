// Comping: expand each chord slot into rhythmic note events according to the
// groove (block / strum / arpeggio, optional bass and metronome). Pure and
// position-based (quarter notes), so it's unit-testable; the engine converts
// quarter-note positions to transport ticks and wires up the sounds.

import { barBeats, beatsToQuarters } from '$lib/model/time';
import { clickAtBeat, type ClickFeel } from './drills';
import type { BassMode, DrumStyle, Groove, TimeSignature } from '$lib/model/types';

export type CompKind = 'chord' | 'bass' | 'click' | 'drum';

export interface CompEvent {
	/** Start position in quarter notes from the loop start. */
	atQuarters: number;
	/** Duration in quarter notes. */
	durQuarters: number;
	/** Notes to play (empty for clicks/drums and for rests that only drive the highlight). */
	midi: number[];
	kind: CompKind;
	/** Slot to highlight when this event fires, or null. */
	slotIndex: number | null;
	/** Metronome / drum accent. */
	accent?: boolean;
	/** Drum sample name for kind 'drum' (e.g. 'kick', 'snare', 'hihat'). */
	drum?: string;
}

export interface CompSlot {
	slotIndex: number;
	/** Start position of the slot, in quarter notes. */
	startQuarters: number;
	/** Slot length in quarter notes. */
	quarters: number;
	/** Voiced chord notes (empty = rest). */
	midi: number[];
	/** Low bass/root note, or null. */
	bassMidi: number | null;
	/** Chord-tone pitch classes (0–11) for building walking/alternating bass lines. */
	bassPcs: number[];
}

const GAP = 0.95; // leave a small gap so re-triggered notes don't blur together

/** Expand one slot's chord into note events for the chosen pattern. */
function compSlot(slot: CompSlot, ts: TimeSignature, groove: Groove): CompEvent[] {
	const events: CompEvent[] = [];
	const { slotIndex, startQuarters, quarters, midi } = slot;

	// A rest (or empty slot) still drives the active-slot highlight.
	if (midi.length === 0) {
		events.push({ atQuarters: startQuarters, durQuarters: quarters, midi: [], kind: 'chord', slotIndex });
		return events;
	}

	const beatStep = 4 / ts.denominator; // one notated beat, in quarter notes

	if (groove.pattern === 'strum') {
		const hits = Math.max(1, Math.round(quarters / beatStep));
		for (let h = 0; h < hits; h++) {
			events.push({
				atQuarters: startQuarters + h * beatStep,
				// Clamp to the slot boundary: fractional-beat slots (e.g. a split 3/4
				// bar) round the hit count up, and the last hit must not ring into
				// the next chord's attack.
				durQuarters: Math.min(beatStep, quarters - h * beatStep) * GAP,
				midi,
				kind: 'chord',
				slotIndex: h === 0 ? slotIndex : null
			});
		}
	} else if (groove.pattern === 'arpeggio') {
		const step = beatStep / 2; // eighth-note arpeggio
		const steps = Math.max(1, Math.round(quarters / step));
		for (let s = 0; s < steps; s++) {
			events.push({
				atQuarters: startQuarters + s * step,
				durQuarters: Math.min(step, quarters - s * step) * GAP,
				midi: [midi[s % midi.length]],
				kind: 'chord',
				slotIndex: s === 0 ? slotIndex : null
			});
		}
	} else {
		// block: hold the whole chord for the slot
		events.push({ atQuarters: startQuarters, durQuarters: quarters, midi, kind: 'chord', slotIndex });
	}

	return events;
}

const BASS_GAP = 0.92; // bass notes are a touch detached, like a plucked upright

/** Root midi of the next sounding slot (wraps to the loop start), for walking targets. */
function nextBassRoot(slots: CompSlot[], from: number): number | null {
	for (let step = 1; step <= slots.length; step++) {
		const next = slots[(from + step) % slots.length];
		if (next.bassMidi !== null) return next.bassMidi;
	}
	return null;
}

/** Chord tones as midis from `root` upward within one octave (root first, ascending). */
function bassToneLadder(root: number, pcs: number[]): number[] {
	const rootPc = ((root % 12) + 12) % 12;
	const offsets = Array.from(new Set(pcs.map((pc) => (((pc - rootPc) % 12) + 12) % 12)));
	if (!offsets.includes(0)) offsets.push(0);
	offsets.sort((a, b) => a - b);
	return offsets.map((o) => root + o);
}

/**
 * Bass line across the whole loop, per mode. Walking looks ahead to the next chord's
 * root so it can lead into it with a chromatic approach note on the last beat.
 */
function bassEvents(slots: CompSlot[], ts: TimeSignature, mode: BassMode): CompEvent[] {
	const events: CompEvent[] = [];
	const beatStep = 4 / ts.denominator; // one notated beat, in quarter notes
	const barQ = beatsToQuarters(barBeats(ts), ts);

	const push = (at: number, dur: number, m: number) =>
		events.push({ atQuarters: at, durQuarters: dur, midi: [m], kind: 'bass', slotIndex: null });

	slots.forEach((slot, i) => {
		const root = slot.bassMidi;
		if (root === null || slot.midi.length === 0) return; // rests carry no bass
		const beats = Math.max(1, Math.round(slot.quarters / beatStep));

		if (mode === 'root') {
			// Root on strong beats: beat 1, plus the bar midpoint for full/longer slots.
			const strong = slot.quarters >= barQ ? [0, barQ / 2] : [0];
			for (const off of strong) {
				if (off >= slot.quarters) continue;
				push(slot.startQuarters + off, Math.min(beatStep * 2, slot.quarters - off) * GAP, root);
			}
			return;
		}

		if (mode === 'alt' || mode === 'octaves') {
			// Root on the strong beats, fifth / upper octave on the weak ones.
			// Durations clamp to the slot boundary so a fractional-beat slot's last
			// note doesn't ring into the next chord.
			const upper = mode === 'alt' ? root + 7 : root + 12;
			for (let b = 0; b < beats; b++) {
				const dur = Math.min(beatStep, slot.quarters - b * beatStep) * BASS_GAP;
				push(slot.startQuarters + b * beatStep, dur, b % 2 === 0 ? root : upper);
			}
			return;
		}

		// walking: a quarter-note line. Root on 1, chord tones through the middle, and a
		// chromatic approach into the next chord's root on the last beat.
		const ladder = bassToneLadder(root, slot.bassPcs);
		const target = nextBassRoot(slots, i);
		let prev = root;
		for (let b = 0; b < beats; b++) {
			let note: number;
			if (b === 0) {
				note = root;
			} else if (b === beats - 1 && target !== null) {
				note = prev <= target ? target - 1 : target + 1; // lead in by a half step
			} else {
				note = ladder[b % ladder.length];
			}
			const dur = Math.min(beatStep, slot.quarters - b * beatStep) * BASS_GAP;
			push(slot.startQuarters + b * beatStep, dur, note);
			prev = note;
		}
	});

	return events;
}

/** Metronome clicks on each notated beat across the loop (filtered by feel). */
function metronomeEvents(totalQuarters: number, ts: TimeSignature, feel: ClickFeel): CompEvent[] {
	const events: CompEvent[] = [];
	const beatStep = 4 / ts.denominator;
	const barQ = beatsToQuarters(barBeats(ts), ts);
	for (let q = 0; q < totalQuarters - 1e-6; q += beatStep) {
		const beatInBar = Math.round((((q % barQ) + barQ) % barQ) / beatStep);
		if (!clickAtBeat(beatInBar, feel)) continue;
		const accent = beatInBar === 0;
		events.push({ atQuarters: q, durQuarters: 0.1, midi: [], kind: 'click', slotIndex: null, accent });
	}
	return events;
}

interface DrumHit {
	at: number;
	drum: 'kick' | 'snare' | 'hihat';
	accent?: boolean;
}

/** One bar of drum hits at quarter-note offsets, scaled to the bar length. */
function drumBarHits(style: DrumStyle, barQ: number): DrumHit[] {
	const hits: DrumHit[] = [];
	const add = (at: number, drum: DrumHit['drum'], accent = false) => {
		if (at < barQ - 1e-6) hits.push({ at, drum, accent });
	};
	if (style === 'none') return hits;

	if (style === 'swing') {
		for (let q = 0; q < barQ; q += 1) {
			add(q, 'hihat');
			add(q + 0.66, 'hihat');
		}
	} else {
		for (let q = 0; q < barQ; q += 0.5) add(q, 'hihat');
	}

	if (style === 'rock') {
		add(0, 'kick', true);
		add(2, 'kick');
		add(1, 'snare');
		add(3, 'snare');
	} else if (style === 'pop') {
		add(0, 'kick', true);
		add(1.5, 'kick');
		add(2, 'kick');
		add(1, 'snare');
		add(3, 'snare');
	} else if (style === 'swing') {
		add(0, 'kick', true);
		add(1, 'snare');
		add(3, 'snare');
	} else if (style === 'bossa') {
		add(0, 'kick', true);
		add(2.5, 'kick');
		add(1.5, 'snare');
		add(3, 'snare');
	}
	return hits;
}

function drumEvents(totalQuarters: number, ts: TimeSignature, style: DrumStyle): CompEvent[] {
	const events: CompEvent[] = [];
	const barQ = beatsToQuarters(barBeats(ts), ts);
	const bar = drumBarHits(style, barQ);
	for (let start = 0; start < totalQuarters - 1e-6; start += barQ) {
		for (const hit of bar) {
			if (start + hit.at >= totalQuarters - 1e-6) continue;
			events.push({
				atQuarters: start + hit.at,
				durQuarters: 0.1,
				midi: [],
				kind: 'drum',
				slotIndex: null,
				drum: hit.drum,
				accent: hit.accent
			});
		}
	}
	return events;
}

/** Build the full ordered event list for a loop. */
export function buildCompEvents(
	slots: CompSlot[],
	totalQuarters: number,
	ts: TimeSignature,
	groove: Groove,
	clickFeel: ClickFeel = 'all'
): CompEvent[] {
	const events = slots.flatMap((slot) => compSlot(slot, ts, groove));
	if (groove.bass !== 'none') events.push(...bassEvents(slots, ts, groove.bass));
	if (groove.metronome) events.push(...metronomeEvents(totalQuarters, ts, clickFeel));
	if (groove.drums !== 'none') events.push(...drumEvents(totalQuarters, ts, groove.drums));
	return events;
}
